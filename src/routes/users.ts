import express from "express";
import path from "path";
import fs from "fs";
import pool, { DB_SCHEMA } from "../db";
import { avatarUpload } from "../middlewares/upload";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
const RELATIVE_AVATAR = (fileName: string) =>
  path.join('uploads', 'avatars', fileName).replace(/\\/g, '/');


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


    const [rows] = await pool.execute(
      'SELECT avatar_path FROM users WHERE id = ?',
      [me.id]
    );
    const old = (rows as any[])[0]?.avatar_path as string | null;
    if (old) rmIfExists(path.join(process.cwd(), old));

    const relative = RELATIVE_AVATAR(req.file.filename);
    await pool.execute('UPDATE users SET avatar_path = ? WHERE id = ?', [
      relative,
      me.id,
    ]);

    res.json({ ok: true, avatarUrl: `${PUBLIC_BASE}/${relative}` });
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
    if (!u) return res.status(404).json({ message: 'User not found' });

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

router.put('/me', requireAuth, async (req, res) => {
  try {
    const me = (req as any).user;
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

    res.json({ ok: true });
  } catch (e) {
    console.error('[users/me PUT] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// router.delete('/me/avatar', requireAuth, async (req, res) => {
//   try {
//     const me = (req as any).user;

//     const [rows] = await pool.execute(
//       'SELECT avatar_path FROM users WHERE id = ?',
//       [me.id]
//     );
//     const cur = (rows as any[])[0]?.avatar_path as string | null;
//     if (cur) rmIfExists(path.join(process.cwd(), cur));

//     await pool.execute('UPDATE users SET avatar_path = NULL WHERE id = ?', [me.id]);
//     res.json({ ok: true });
//   } catch (e) {
//     console.error('[users.me/avatar DELETE] error', e);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, status } = req.body ?? {};

    if (email && typeof email !== 'string') {
      return res.status(400).json({ message: 'Invalid email' });
    }
    if (username && typeof username !== 'string') {
      return res.status(400).json({ message: 'Invalid username' });
    }
    if (role && !['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (status && !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
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
    console.error('[admin users/:id PUT] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/avatar', requireAuth, requireAdmin, avatarUpload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No file' });

    const [rows] = await pool.execute(
      'SELECT avatar_path FROM users WHERE id = ?',
      [id]
    );
    const old = (rows as any[])[0]?.avatar_path as string | null;
    if (old) rmIfExists(path.join(process.cwd(), old));

    const relative = RELATIVE_AVATAR(req.file.filename);
    await pool.execute('UPDATE users SET avatar_path = ? WHERE id = ?', [
      relative,
      id,
    ]);

    res.json({ ok: true, avatarUrl: `${PUBLIC_BASE}/${relative}` });
  } catch (e) {
    console.error('[admin users/:id/avatar POST] error', e);
    res.status(500).json({ message: 'Server error' });
  }
});


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

//  GET: ประวัติธุรกรรมของผู้ใช้ (20 รายการล่าสุด)
router.post("/me/wallet/topup", requireAuth, async (req, res) => {
  const me = (req as any).user;
  let { amount } = req.body || {};
  amount = Number(amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      "UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?",
      [amount, me.id]
    );

    const [rows] = await conn.execute<any[]>(
      "SELECT wallet_balance FROM users WHERE id = ?",
      [me.id]
    );

    const wallet = rows.length > 0 ? Number(rows[0].wallet_balance) : 0;

    await conn.execute(
      `INSERT INTO wallet_transactions
       (user_id, type, amount, balance_after, ref_order_id, note)
       VALUES (?, 'TOPUP', ?, ?, NULL, ?)`,
      [me.id, amount, wallet, "Add Funds"]
    );

    await conn.commit();
    res.json({ ok: true, balance: wallet });
  } catch (e) {
    await conn.rollback();
    console.error("[/users/me/wallet/topup] error", e);
    res.status(500).json({ error: "Server error" });
  } finally {
    conn.release();
  }
});

router.get("/me/wallet/transactions", requireAuth, async (req, res) => {
  const me = (req as any).user;
  try {
const [rows] = await pool.execute(
  `
  SELECT 
    wt.id,
    wt.type,
    wt.amount,
    wt.balance_after,
    wt.created_at,
    wt.note,
    g.title AS title
  FROM wallet_transactions wt
  LEFT JOIN orders o ON o.id = wt.ref_order_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN games g ON g.id = oi.game_id
  WHERE wt.user_id = ?
  ORDER BY wt.id DESC
  LIMIT 30
  `,
  [me.id]
);

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("[/users/me/wallet/transactions] error", e);
    res.status(500).json({ error: "Server error" });
  }
});

router.post('/me/wallet/charge', requireAuth, async (req, res) => {
  const me = (req as any).user;
  const gameId = Number(req.body?.gameId);
  const qty = Math.max(1, Number(req.body?.qty || 1));

  if (!Number.isFinite(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Invalid gameId' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [gRows] = await conn.execute(
      `SELECT id, title, price, status FROM games WHERE id = ? FOR UPDATE`,
      [gameId]
    );
    const game = (gRows as any[])[0];
    if (!game || game.status !== 'ACTIVE') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Game not available' });
    }

    const [ownRows] = await conn.execute(
      `SELECT 1 FROM user_games WHERE user_id = ? AND game_id = ? LIMIT 1`,
      [me.id, gameId]
    );
    if ((ownRows as any[]).length) {
      await conn.rollback(); conn.release();
      return res.status(409).json({ error: 'Already owned' });
    }

    const total = Number(game.price) * qty;

    const [uRows] = await conn.execute(
      `SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE`,
      [me.id]
    );
    const bal = Number((uRows as any[])[0]?.wallet_balance ?? 0);
    if (bal < total) {
      await conn.rollback(); conn.release();
      return res.status(402).json({ error: 'Insufficient balance' });
    }

    const newBal = +(bal - total).toFixed(2);
    await conn.execute(
      `UPDATE users SET wallet_balance = ? WHERE id = ?`,
      [newBal, me.id]
    );

    const [oRes] = await conn.execute(
      `INSERT INTO orders (user_id, total_before_discount, discount_amount, total_paid, status)
       VALUES (?, ?, 0.00, ?, 'PAID')`,
      [me.id, total, total]
    );
    const orderId = (oRes as any).insertId;

    await conn.execute(
      `INSERT INTO order_items (order_id, game_id, unit_price, qty, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, gameId, game.price, qty, total]
    );

    await conn.execute(
      `INSERT INTO user_games (user_id, game_id) VALUES (?, ?)`,
      [me.id, gameId]
    );

    await conn.execute(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, ref_order_id, note)
       VALUES (?, 'PURCHASE', ?, ?, ?, ?)`,
      [me.id, total, newBal, orderId, `Buy: ${game.title}`]
    );

    await conn.commit();
    res.json({ ok: true, balance: newBal, orderId });
  } catch (e) {
    await conn.rollback();
    console.error('[charge] error', e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, username, email, avatar_path
       FROM \`${DB_SCHEMA}\`.users
      WHERE role = 'USER' AND status = 'ACTIVE'
      ORDER BY id DESC
      LIMIT 100`
  );

  const data = rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    avatarUrl: r.avatar_path ? `${PUBLIC_BASE}/${r.avatar_path}` : null,
  }));

  res.json({ ok: true, data });
});


export default router;
