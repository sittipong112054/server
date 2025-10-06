"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.ts
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
const COOKIE_NAME = "session_token";
// -------- uploads (root-level: <project>/uploads) --------
const uploadRoot = path_1.default.join(process.cwd(), "uploads");
fs_1.default.mkdirSync(uploadRoot, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname || "").toLowerCase();
        const name = `${Date.now()}_${Math.round(Math.random() * 1e8)}${ext}`;
        cb(null, name);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    },
});
const makeAvatarUrl = (p) => (p ? `${PUBLIC_BASE}/${p}` : null);
// ========== REGISTER (multipart/form-data) ==========
router.post("/register", upload.single("avatar"), async (req, res) => {
    try {
        const { username, email, password, role } = req.body || {};
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }
        const [dup] = await db_1.default.execute("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1", [username, email]);
        if (dup.length) {
            return res.status(409).json({ error: "username or email already taken" });
        }
        const hash = await bcrypt_1.default.hash(password, 12);
        const avatar_path = req.file ? `uploads/${req.file.filename}`.replace(/\\/g, "/") : null;
        const userRole = role === "ADMIN" ? "ADMIN" : "USER";
        const [result] = await db_1.default.execute(`INSERT INTO users (username, email, password_hash, role, status, avatar_path)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`, [username, email, hash, userRole, avatar_path]);
        const id = result.insertId;
        return res.status(201).json({ id, username, email, avatarUrl: makeAvatarUrl(avatar_path) });
    }
    catch (err) {
        console.error("[register] error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ========== LOGIN ==========
router.post("/login", async (req, res) => {
    try {
        let { usernameOrEmail, password } = req.body || {};
        usernameOrEmail = (usernameOrEmail ?? "").trim();
        password = (password ?? "").trim();
        if (!usernameOrEmail || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }
        const [rows] = await db_1.default.execute(`SELECT id, username, email, password_hash, role, status, avatar_path, wallet_balance
         FROM users
        WHERE username = ? OR email = ?
        LIMIT 1`, [usernameOrEmail, usernameOrEmail]);
        const user = rows[0];
        if (!user)
            return res.status(401).json({ error: "Invalid credentials" });
        if (user.status !== "ACTIVE")
            return res.status(403).json({ error: "Account inactive" });
        console.log('[login] rows len =', rows.length);
        const ok = await bcrypt_1.default.compare(password, user.password_hash ?? '');
        console.log('[login] compare =', ok);
        if (!ok)
            return res.status(401).json({ error: "Invalid credentials" });
        const token = crypto_1.default.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
        await db_1.default.execute(`INSERT INTO sessions
         (user_id, session_token, issued_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, NOW(), ?, ?, ?)`, [user.id, token, expiresAt, req.ip, req.get("User-Agent") || null]);
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/",
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
    }
    catch (err) {
        console.error("[login] error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ========== LOGOUT ==========
router.post("/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const token = req.cookies?.[COOKIE_NAME] ||
        (req.body && req.body.token) ||
        bearer;
    if (!token)
        return res.status(400).json({ error: "No token" });
    try {
        await db_1.default.execute(`UPDATE sessions
          SET revoked_at = NOW(), revoked_reason = ?
        WHERE session_token = ?`, ["logout", token]);
        res.clearCookie(COOKIE_NAME, { path: "/" });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("[logout] error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});
router.get("/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const token = req.cookies?.[COOKIE_NAME] ||
        (req.query && req.query.token) ||
        bearer;
    if (!token)
        return res.status(401).json({ error: "No session" });
    try {
        const [rows] = await db_1.default.execute(`SELECT
         s.id AS sid, s.expires_at, s.revoked_at,
         u.id, u.username, u.email, u.role, u.status,
         u.avatar_path, u.wallet_balance
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.session_token = ?
       LIMIT 1`, [token]);
        const r = rows[0];
        if (!r)
            return res.status(401).json({ error: "Invalid session" });
        if (r.revoked_at)
            return res.status(401).json({ error: "Session revoked" });
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
                role: r.role,
                wallet_balance: r.wallet_balance || 0,
                avatar_path: r.avatar_path || null,
                avatarUrl: makeAvatarUrl(r.avatar_path),
            },
        });
    }
    catch (err) {
        console.error("[me] error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});
exports.default = router;
