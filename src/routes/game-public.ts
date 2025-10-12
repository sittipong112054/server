import express from 'express';
import pool from '../db';

const router = express.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT g.id, g.title, g.price, g.category_id AS categoryId,
              c.name AS categoryName,
              g.image_path AS imagePath,
              g.description, g.released_at AS releasedAt,
              g.release_date AS releaseDate, g.status
         FROM games g
         JOIN categories c ON c.id = g.category_id
        WHERE g.id = ?
        LIMIT 1`,
      [id]
    );

    const r = (rows as any[])[0];
    if (!r) return res.status(404).json({ ok:false, error: 'Game not found' });

    res.json({
      ok: true,
      data: {
        id: r.id,
        title: r.title,
        price: Number(r.price),
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        imageUrl: r.imagePath ? `${PUBLIC_BASE}/${String(r.imagePath).replace(/^\/?/, '')}` : null,
        description: r.description,
        releasedAt: r.releasedAt,
        releaseDate: r.releaseDate,
        status: r.status
      }
    });
  } catch (e) {
    console.error('[public/games GET :id]', e);
    res.status(500).json({ ok:false, error: 'Server error' });
  }
});

export default router;
