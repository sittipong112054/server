import express from 'express';
import pool from '../db';
const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name FROM categories ORDER BY name`
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[categories GET] error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
