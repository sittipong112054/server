// src/routes/me.ts
import express from 'express';
import pool from '../db';
import { requireAuth } from '../middlewares/authMiddleware';

const router = express.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';
const toUrl = (p?: string|null) => p ? `${PUBLIC_BASE}/${String(p).replace(/^\/?/, '')}` : null;

// GET /me/games  -> เกมที่ผู้ใช้คนนี้เป็นเจ้าของ
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
    cover: toUrl(r.imagePath), // absolute URL
  }));

  res.json({ ok: true, data });
});

// router.get('/purchases', requireAuth, async (req: any, res) => {
//   const userId = req.user.id;
//   const [rows] = await pool.execute(
//     `SELECT
//         o.id AS orderId,
//         o.total_paid AS total,
//         o.created_at AS orderedAt,
//         g.title,
//         g.image_path AS imagePath
//      FROM orders o
//      JOIN order_items oi ON oi.order_id = o.id
//      JOIN games g ON g.id = oi.game_id
//      WHERE o.user_id = ? AND o.status = 'PAID'
//      ORDER BY o.created_at DESC`,
//     [userId]
//   );

//   const data = (rows as any[]).map(r => ({
//     orderId: r.orderId,
//     title: r.title,
//     cover: toUrl(r.imagePath),
//     price: Number(r.total),
//     date: new Date(r.orderedAt).toISOString(),
//   }));

//   res.json({ ok: true, data });
// });

export default router;
