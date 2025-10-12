// src/routes/store.ts
import express from "express";
import pool from "../db";

const router = express.Router();

router.get("/games", async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT g.id, g.title, g.price,
             c.name AS categoryName,
             g.image_path AS imagePath,
             g.description,
             g.released_at AS releasedAt,
             g.release_date AS releaseDate
      FROM games g
      JOIN categories c ON c.id = g.category_id
      WHERE g.status = 'ACTIVE'
      ORDER BY g.created_at DESC
    `);

    const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";

    const data = (rows as any[]).map(r => ({
      id: r.id,
      title: r.title,
      price: Number(r.price),
      genre: r.categoryName, // ใช้แทน genre
      cover: r.imagePath ? `${PUBLIC_BASE}/${r.imagePath}` : '/assets/placeholder-wide.jpg',
      description: r.description,
      releasedAt: r.releasedAt,
      releaseDate: r.releaseDate,
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[store/games] error", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
