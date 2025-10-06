import { Request, Response, NextFunction } from 'express';
import pool from '../db';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers['authorization']?.toString() ?? '';
    const bearer = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : undefined;

    const token = req.cookies?.session_token || bearer;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const [rows] = await pool.execute(
      `SELECT s.id AS sid, s.expires_at, s.revoked_at,
              u.id, u.username, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.session_token = ?
        LIMIT 1`,
      [token]
    );

    const r = (rows as any[])[0];
    if (!r)      return res.status(401).json({ error: 'Invalid session' });
    if (r.revoked_at) return res.status(401).json({ error: 'Session revoked' });
    if (r.expires_at && new Date(r.expires_at) < new Date())
                  return res.status(401).json({ error: 'Session expired' });

    (req as any).user = { id: r.id, username: r.username, role: r.role };
    next();
  } catch (err) {
    console.error('[requireAuth] error', err);
    res.status(500).json({ error: 'Server error' });
  }
}


export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin only' });
  }

  next();
}