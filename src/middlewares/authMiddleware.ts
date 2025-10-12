import { Request, Response, NextFunction } from "express";
import pool, { DB_SCHEMA } from "../db";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.headers["authorization"]?.toString() ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : undefined;

    const token = req.cookies?.session_token || bearer;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

const [rows] = await pool.execute(
  `SELECT s.id AS sid, s.expires_at, s.revoked_at,
          u.id, u.username, u.email, u.role, u.status
     FROM \`${DB_SCHEMA}\`.sessions s
     JOIN \`${DB_SCHEMA}\`.users u ON u.id = s.user_id
    WHERE s.session_token = ?
    LIMIT 1`,
  [token]
);

    const r = (rows as any[])[0];
    if (!r) {
      console.warn("[requireAdmin] invalid session token");
      return res.status(401).json({ error: "Invalid session" });
    }
    if (r.revoked_at) {
      console.warn("[requireAdmin] revoked");
      return res.status(401).json({ error: "Session revoked" });
    }
    if (r.expires_at && new Date(r.expires_at) < new Date()) {
      console.warn("[requireAdmin] expired");
      return res.status(401).json({ error: "Session expired" });
    }
    if (r.status !== "ACTIVE") {
      console.warn("[requireAdmin] inactive user");
      return res.status(403).json({ error: "Account inactive" });
    }

    (req as any).user = {
      id: r.id,
      role: r.role,
      email: r.email,
      username: r.username,
    };
    
    next();
  } catch (err) {
    console.error("[requireAdmin] error", err);
    res.status(500).json({ error: "Server error" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (user.role !== "ADMIN")
    return res.status(403).json({ error: "Forbidden: admin only" });
  next();
}