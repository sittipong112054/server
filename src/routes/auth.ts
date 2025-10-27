import { Router, Request, Response } from "express";
import pool from "../db";
import bcrypt from "bcrypt";
import crypto, { hash } from "crypto";
import path from "path";
import multer from "multer";
import fs from "fs";

const router = Router();

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
const isProd = process.env.NODE_ENV === "production";
const COOKIE_NAME = "session_token";

const uploadRoot = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const name = `${Date.now()}_${Math.round(Math.random() * 1e8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const makeAvatarUrl = (p?: string | null) => (p ? `${PUBLIC_BASE}/${p}` : null);

router.post(
  "/register",
  upload.single("avatar"),
  async (req: Request, res: Response) => {
    try {
      const { username, email, password, role } = req.body || {};
      if (!username || !email || !password) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const [dup] = await pool.execute(
        "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
        [username, email]
      );
      if ((dup as any[]).length) {
        return res
          .status(409)
          .json({ error: "username or email already taken" });
      }

      const hash = await bcrypt.hash(password, 12);
      const avatar_path = req.file
        ? `uploads/${req.file.filename}`.replace(/\\/g, "/")
        : null;
      const userRole = role === "ADMIN" ? "ADMIN" : "USER";

      const [result] = await pool.execute(
        `INSERT INTO users (username, email, password_hash, role, status, avatar_path)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
        [username, email, hash, userRole, avatar_path]
      );

      const id = (result as any).insertId;
      return res
        .status(201)
        .json({ id, username, email, avatarUrl: makeAvatarUrl(avatar_path) });
    } catch (err: any) {
      console.error("[register] error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post("/login", async (req: Request, res: Response) => {
  try {
    let { usernameOrEmail, password } = req.body || {};
    usernameOrEmail = (usernameOrEmail ?? "").trim();
    password = (password ?? "").trim();

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const [rows] = await pool.execute(
      `SELECT id, username, email, password_hash, role, status, avatar_path, wallet_balance
         FROM users
        WHERE username = ? OR email = ?
        LIMIT 1`,
      [usernameOrEmail, usernameOrEmail]
    );

    const user = (rows as any[])[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status !== "ACTIVE")
      return res.status(403).json({ error: "Account inactive" });

    console.log("[login] rows len =", (rows as any[]).length);
    const ok = await bcrypt.compare(password, user.password_hash ?? "");
    console.log("[login] compare =", ok);

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await pool.execute(
      `INSERT INTO sessions
         (user_id, session_token, issued_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [user.id, token, expiresAt, req.ip, req.get("User-Agent") || null]
    );

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        wallet_balance: user.wallet_balance || 0,
        avatar_path: user.avatar_path || null,
        avatarUrl: makeAvatarUrl(user.avatar_path),
      },
    });
  } catch (err) {
    console.error("[login] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  const token =
    (req as any).cookies?.[COOKIE_NAME] ||
    (req.body && req.body.token) ||
    bearer;

  if (!token) return res.status(400).json({ error: "No token" });

  try {
    await pool.execute(
      `UPDATE sessions
          SET revoked_at = NOW(), revoked_reason = ?
        WHERE session_token = ?`,
      ["logout", token]
    );

    res.clearCookie(COOKIE_NAME, {
      path: "/",
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[logout] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  const token =
    (req as any).cookies?.[COOKIE_NAME] ||
    (req.query && (req.query.token as string)) ||
    bearer;

  if (!token) return res.status(401).json({ error: "No session" });

  try {
    const [rows] = await pool.execute(
      `SELECT
         s.id AS sid, s.expires_at, s.revoked_at,
         u.id, u.username, u.email, u.role, u.status,
         u.avatar_path, u.wallet_balance
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.session_token = ?
       LIMIT 1`,
      [token]
    );

    const r = (rows as any[])[0];
    if (!r) return res.status(401).json({ error: "Invalid session" });
    if (r.revoked_at) return res.status(401).json({ error: "Session revoked" });
    if (r.expires_at && new Date(r.expires_at) < new Date())
      return res.status(401).json({ error: "Session expired" });
    if (r.status !== "ACTIVE")
      return res.status(403).json({ error: "Account inactive" });

    return res.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        email: r.email,
        role: r.role as "USER" | "ADMIN",
        wallet_balance: r.wallet_balance || 0,
        avatar_path: r.avatar_path || null,
        avatarUrl: makeAvatarUrl(r.avatar_path),
      },
    });
  } catch (err) {
    console.error("[me] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
