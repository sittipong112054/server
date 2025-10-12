import express from 'express';
import pool from '../db';
import { requireAuth } from '../middlewares/authMiddleware';

const router = express.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';
const toUrl = (p?: string|null) => p ? `${PUBLIC_BASE}/${String(p).replace(/^\/?/, '')}` : null;

router.get('/games', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  const [rows] = await pool.execute(
    `SELECT g.id, g.title, g.image_path AS imagePath
       FROM user_games ug
       JOIN games g ON g.id = ug.game_id
      WHERE ug.user_id = ?
      ORDER BY ug.purchased_at DESC`,
    [userId]
  );

  const data = (rows as any[]).map(r => ({
    id: String(r.id),
    title: r.title,
    cover: toUrl(r.imagePath),
  }));

  res.json({ ok: true, data });
});

export default router;
