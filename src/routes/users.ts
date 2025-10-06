// src/routes/users.ts
import express from "express";
import path from "path";
import fs from "fs";
import pool from "../db";
import { avatarUpload } from "../middlewares/upload";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";

function toRelativeAvatar(fileName: string) {
  return path.join("uploads", "avatars", fileName).replace(/\\/g, "/");
}

function rmIfExists(absPath: string) {
  try {
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (e) {
    console.warn("[users] unlink error:", e);
  }
}

router.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    const me = (req as any).user;
    if (!req.file) return res.status(400).json({ message: 'No file' });

    const [rows] = await pool.execute('SELECT avatar_path FROM users WHERE id = ?', [me.id]);
    const old = (rows as any[])[0]?.avatar_path as string | null;
    if (old) {
      const oldPath = path.join(process.cwd(), old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relative = path.join('uploads', 'avatars', req.file.filename).replace(/\\/g, '/');
    await pool.execute('UPDATE users SET avatar_path = ? WHERE id = ?', [relative, me.id]);

    const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';
    res.json({
      ok: true,
      avatarUrl: `${PUBLIC_BASE}/${relative}`, // ✅ ส่ง URL เต็มกลับ Angular
    });
  } catch (e) {
    console.error('[users.me/avatar POST] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const me = (req as any).user;
    const [rows] = await pool.execute(
      'SELECT id, username, email, wallet_balance, avatar_path FROM users WHERE id = ?',
      [me.id]
    );
    const u = (rows as any[])[0];
    const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';
    res.json({
      ok: true,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        wallet_balance: u.wallet_balance ?? 0,
        avatarUrl: u.avatar_path ? `${PUBLIC_BASE}/${u.avatar_path}` : null,
      },
    });
  } catch (e) {
    console.error('[users/me GET] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// src/routes/users.ts
router.put('/me', requireAuth, async (req, res) => {
  try {
    const me = (req as any).user; // มาจาก requireAuth
    const { username, email } = req.body ?? {};

    if (username && typeof username !== 'string') {
      return res.status(400).json({ message: 'Invalid username' });
    }
    if (email && typeof email !== 'string') {
      return res.status(400).json({ message: 'Invalid email' });
    }

    await pool.execute(
      `UPDATE users
       SET username = COALESCE(?, username),
           email    = COALESCE(?, email)
       WHERE id = ?`,
      [username ?? null, email ?? null, me.id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('[users/me PUT] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});


// ลบรูปโปรไฟล์ตัวเอง (กลับไปใช้ default)
router.delete("/me/avatar", requireAuth, async (req, res) => {
  try {
    const me = (req as any).user;
    const [rows] = await pool.execute(
      "SELECT avatar_path FROM users WHERE id = ?",
      [me.id]
    );
    const cur = (rows as any[])[0]?.avatar_path as string | null;
    if (cur) rmIfExists(path.join(process.cwd(), cur));
    await pool.execute("UPDATE users SET avatar_path = NULL WHERE id = ?", [
      me.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[users.me/avatar DELETE] error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- ADMIN SCOPE ----------

// แก้ไขข้อมูลผู้ใช้ตาม id
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, status } = req.body ?? {};

    if (email && typeof email !== "string") {
      return res.status(400).json({ message: "Invalid email" });
    }
    if (username && typeof username !== "string") {
      return res.status(400).json({ message: "Invalid fusername" });
    }
    if (role && !["USER", "ADMIN"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (status && !["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await pool.execute(
      `UPDATE users
     SET username = COALESCE(?, username),
         email    = COALESCE(?, email),
         role     = COALESCE(?, role),
         status   = COALESCE(?, status)
   WHERE id = ?`,
      [username ?? null, email ?? null, role ?? null, status ?? null, id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("[admin users/:id PUT] error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// อัปโหลด/เปลี่ยนรูปผู้ใช้ตาม id
router.post(
  "/:id/avatar",
  requireAdmin,
  avatarUpload.single("avatar"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ message: "No file" });

      const [rows] = await pool.execute(
        "SELECT avatar_path FROM users WHERE id = ?",
        [id]
      );
      const old = (rows as any[])[0]?.avatar_path as string | null;
      if (old) rmIfExists(path.join(process.cwd(), old));

      const relative = toRelativeAvatar(req.file.filename);
      await pool.execute("UPDATE users SET avatar_path = ? WHERE id = ?", [
        relative,
        id,
      ]);

      res.json({ ok: true, avatarUrl: `${PUBLIC_BASE}/${relative}` });
    } catch (e) {
      console.error("[admin users/:id/avatar POST] error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ลบรูปผู้ใช้ตาม id
router.delete("/:id/avatar", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      "SELECT avatar_path FROM users WHERE id = ?",
      [id]
    );
    const cur = (rows as any[])[0]?.avatar_path as string | null;
    if (cur) rmIfExists(path.join(process.cwd(), cur));
    await pool.execute("UPDATE users SET avatar_path = NULL WHERE id = ?", [
      id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[admin users/:id/avatar DELETE] error", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
