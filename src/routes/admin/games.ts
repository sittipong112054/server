// src/routes/games.ts
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import pool from "../../db";
import { requireAdmin, requireAuth } from "../../middlewares/authMiddleware";

const router = express.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";

// storage
const root = path.join(process.cwd(), "uploads", "games");
fs.mkdirSync(root, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, root),
  filename: (_req, f, cb) => {
    const ext = path.extname(f.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("image only"));
    cb(null, true);
  },
});

const toUrl = (p?: string | null) => (p ? `${PUBLIC_BASE}/${p}` : null);

// ✅ GET /admin/games — ดึงเกมทั้งหมดพร้อมชื่อหมวด
router.get("/",requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        g.id, g.title, g.price, g.category_id AS categoryId,
        c.name AS categoryName,
        g.image_path AS imagePath,
        g.description, g.released_at AS releasedAt,
        g.release_date AS releaseDate, g.status
      FROM games g
      JOIN categories c ON g.category_id = c.id
      ORDER BY g.id DESC
    `);

    const data = (rows as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      description: r.description,
      releasedAt: r.releasedAt,
      releaseDate: r.releaseDate,
      status: r.status,
      imageUrl: r.imagePath ? `${PUBLIC_BASE}/${r.imagePath}` : null,
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[admin/games GET] error", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST /admin/games — เพิ่มเกมใหม่
router.post("/",requireAuth, requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, price, categoryId, description, releasedAt } = req.body;
    const imagePath = req.file
      ? `uploads/games/${req.file.filename}`.replace(/\\/g, "/")
      : null;

    await pool.execute(
      `INSERT INTO games (title, price, category_id, image_path, description, released_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, price, categoryId, imagePath, description, releasedAt || new Date()]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/games POST] error", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put('/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, price, categoryId, description, releasedAt } = req.body;

    let sql = `UPDATE games
               SET title=?, price=?, category_id=?, description=?, released_at=?`;
    const params: any[] = [title, price, categoryId, description || null, releasedAt || new Date()];

    if (req.file) {
      // ลบรูปเก่า
      const [r] = await pool.execute(`SELECT image_path FROM games WHERE id=? LIMIT 1`, [id]);
      const old = (r as any[])[0]?.image_path as string | undefined;
      if (old) {
        const abs = path.join(process.cwd(), old);
        try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {}
      }
      const newPath = `uploads/games/${req.file.filename}`.replace(/\\/g, '/');
      sql += `, image_path=?`;
      params.push(newPath);
    }

    sql += ` WHERE id=?`;
    params.push(id);

    await pool.execute(sql, params);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/games PUT]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// src/routes/admin/games.ts (เติมด้านล่าง near other routes)
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
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
    if (!r) return res.status(404).json({ error: 'Game not found' });

    res.json({
      ok: true,
      data: {
        id: r.id,
        title: r.title,
        price: Number(r.price),
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        imageUrl: r.imagePath ? `${PUBLIC_BASE}/${r.imagePath}` : null,
        description: r.description,
        releasedAt: r.releasedAt,   // datetime
        releaseDate: r.releaseDate, // virtual date (YYYY-MM-DD)
        status: r.status,
      }
    });
  } catch (e) {
    console.error('[admin/games GET :id]', e);
    res.status(500).json({ error: 'Server error' });
  }
});


router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await pool.execute(`SELECT image_path FROM games WHERE id=? LIMIT 1`, [id]);
    const cur = (r as any[])[0]?.image_path as string | undefined;
    if (cur) {
      const abs = path.join(process.cwd(), cur);
      try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {}
    }
    await pool.execute(`DELETE FROM games WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/games DELETE]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
