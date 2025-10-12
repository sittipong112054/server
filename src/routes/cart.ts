import express from 'express';

import { requireAuth } from '../middlewares/authMiddleware';
import pool from '../db';
const router = express.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';

const toUrl = (p?: string | null) =>
  p ? `${PUBLIC_BASE}/${String(p).replace(/^\/?/, '')}` : null;


const two = (n: number) => +n.toFixed(2);


const unitFinal = (price: number /*, discount?: number*/) => two(price);



router.get('/', requireAuth, async (req: any, res) => {
  const userId = req.user.id;

  const [rows] = await pool.execute(
    `SELECT
        ci.id            AS itemId,
        ci.game_id       AS gameId,
        ci.qty           AS qty,
        g.title          AS title,
        g.price          AS price,
        g.image_path     AS imagePath
     FROM cart_items ci
     JOIN games g ON g.id = ci.game_id
     WHERE ci.user_id = ?
     ORDER BY ci.id DESC`,
    [userId]
  );

  const data = (rows as any[]).map(r => ({
    itemId: r.itemId,
    gameId: r.gameId,
    title: r.title,
    cover: toUrl(r.imagePath),
    price: Number(r.price),
    qty: Number(r.qty),
  }));

  res.json({ ok: true, data });
});

router.post('/', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  const { gameId, qty = 1 } = req.body;

  if (!gameId || Number(qty) <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid payload' });
  }

  await pool.execute(
    `INSERT INTO cart_items (user_id, game_id, qty)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
    [userId, gameId, qty]
  );

  const [rows] = await pool.execute(
    `SELECT
        ci.id AS itemId, ci.game_id AS gameId, ci.qty,
        g.title, g.price, g.image_path AS imagePath
     FROM cart_items ci
     JOIN games g ON g.id = ci.game_id
     WHERE ci.user_id = ? AND ci.game_id = ?
     LIMIT 1`,
    [userId, gameId]
  );
  const r = (rows as any[])[0];

  res.json({
    ok: true,
    data: {
      itemId: r.itemId,
      gameId: r.gameId,
      title: r.title,
      cover: toUrl(r.imagePath),
      price: Number(r.price),
      qty: Number(r.qty),
    },
  });
});

router.patch('/:itemId', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;
  const { qty } = req.body;

  if (!qty || Number(qty) <= 0) {
    return res.status(400).json({ ok: false, error: 'qty must be > 0' });
  }

  await pool.execute(
    `UPDATE cart_items SET qty=? WHERE id=? AND user_id=?`,
    [qty, itemId, userId]
  );

  const [rows] = await pool.execute(
    `SELECT
        ci.id AS itemId, ci.game_id AS gameId, ci.qty,
        g.title, g.price, g.image_path AS imagePath
     FROM cart_items ci
     JOIN games g ON g.id = ci.game_id
     WHERE ci.id=? AND ci.user_id=? LIMIT 1`,
    [itemId, userId]
  );
  const r = (rows as any[])[0];

  if (!r) return res.status(404).json({ ok: false, error: 'item not found' });

  res.json({
    ok: true,
    data: {
      itemId: r.itemId,
      gameId: r.gameId,
      title: r.title,
      cover: toUrl(r.imagePath),
      price: Number(r.price),
      qty: Number(r.qty),
    },
  });
});

router.delete('/:itemId', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;

  await pool.execute(
    `DELETE FROM cart_items WHERE id=? AND user_id=?`,
    [itemId, userId]
  );

  res.json({ ok: true });
});

router.post('/validate-coupon', requireAuth, async (req, res) => {
  const { code, subtotal = 0 } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: 'missing code' });

  const now = new Date();

  const [rows] = await pool.execute(
    `SELECT id, code, discount_type, discount_value, max_uses, per_user_limit,
            used_count, active, start_at, end_at
       FROM discount_codes
      WHERE code = ? LIMIT 1`,
    [code]
  );
  const dc = (rows as any[])[0];
  if (!dc) return res.status(404).json({ ok: false, error: 'coupon not found' });
  if (!dc.active) return res.status(400).json({ ok: false, error: 'inactive coupon' });

  if (dc.start_at && now < new Date(dc.start_at)) {
    return res.status(400).json({ ok: false, error: 'coupon not started' });
  }
  if (dc.end_at && now > new Date(dc.end_at)) {
    return res.status(400).json({ ok: false, error: 'coupon expired' });
  }

  if (dc.max_uses && Number(dc.used_count) >= Number(dc.max_uses)) {
    return res.status(400).json({ ok: false, error: 'coupon exhausted' });
  }

  const [ur] = await pool.execute(
    `SELECT COUNT(*) AS used
       FROM code_redemptions
      WHERE code_id=? AND user_id=?`,
    [dc.id, (req as any).user.id]
  );
  const used = Number((ur as any[])[0].used || 0);
  if (used >= Number(dc.per_user_limit || 1)) {
    return res.status(400).json({ ok: false, error: 'user limit reached' });
  }

  const value = Number(dc.discount_value);
  let amount = 0;
  if (dc.discount_type === 'PERCENT') {
    amount = two((Number(subtotal) || 0) * value / 100);
  } else {
    amount = two(Math.min(value, Number(subtotal) || 0));
  }

  if (amount <= 0) return res.status(400).json({ ok: false, error: 'subtotal too low' });

  res.json({ ok: true, data: { code: dc.code, amount } });
});

router.post('/checkout', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  const { itemIds = [], coupon } = req.body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'no items' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT
          ci.id AS itemId, ci.qty,
          g.id AS gameId, g.title, g.price
       FROM cart_items ci
       JOIN games g ON g.id = ci.game_id
       WHERE ci.user_id = ? AND ci.id IN (${itemIds.map(() => '?').join(',')})
       FOR UPDATE`,
      [userId, ...itemIds]
    );
    const items = rows as any[];
    if (items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: 'items not found' });
    }

    let subtotal = 0;
    for (const r of items) {
      const unit = unitFinal(Number(r.price));
      subtotal += unit * Number(r.qty);
    }
    subtotal = two(subtotal);

    let discount = 0;
    let codeId: number | null = null;

    if (coupon?.code) {
      const [cRows] = await conn.execute(
        `SELECT id, code, discount_type, discount_value, max_uses, per_user_limit,
                used_count, active, start_at, end_at
           FROM discount_codes
          WHERE code=? FOR UPDATE`,
        [coupon.code]
      );
      const dc = (cRows as any[])[0];
      if (!dc) throw new Error('coupon not found');
      const now = new Date();
      if (!dc.active) throw new Error('coupon inactive');
      if (dc.start_at && now < new Date(dc.start_at)) throw new Error('coupon not started');
      if (dc.end_at && now > new Date(dc.end_at)) throw new Error('coupon expired');
      if (dc.max_uses && Number(dc.used_count) >= Number(dc.max_uses)) throw new Error('coupon exhausted');

      const [ur] = await conn.execute(
        `SELECT COUNT(*) AS used FROM code_redemptions WHERE code_id=? AND user_id=?`,
        [dc.id, userId]
      );
      const used = Number((ur as any[])[0].used || 0);
      if (used >= Number(dc.per_user_limit || 1)) throw new Error('user limit reached');

      const val = Number(dc.discount_value);
      if (dc.discount_type === 'PERCENT') discount = two(subtotal * val / 100);
      else discount = two(Math.min(val, subtotal));

      codeId = dc.id;
    }

    const total = two(Math.max(0, subtotal - discount));

    const [oRes] = await conn.execute(
      `INSERT INTO orders (user_id, total_before_discount, discount_amount, total_paid, status)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, subtotal, discount, total, 'PENDING']
    );
    const orderId = (oRes as any).insertId;

    for (const r of items) {
      const unit = unitFinal(Number(r.price));
      const sub = two(unit * Number(r.qty));
      await conn.execute(
        `INSERT INTO order_items (order_id, game_id, unit_price, qty, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, r.gameId, unit, r.qty, sub]
      );
    }

    let newBalance: number | null = null;
    let status = 'PENDING';

    const [uRows] = await conn.execute(
      `SELECT wallet_balance FROM users WHERE id=? FOR UPDATE`,
      [userId]
    );
    const curBal = Number((uRows as any[])[0].wallet_balance || 0);

    if (curBal >= total) {
      newBalance = two(curBal - total);
      await conn.execute(
        `UPDATE users SET wallet_balance=? WHERE id=?`,
        [newBalance, userId]
      );
      await conn.execute(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, ref_order_id, note)
         VALUES (?, 'PURCHASE', ?, ?, ?, ?)`,
        [userId, total, newBalance, orderId, 'Order payment']
      );
      await conn.execute(`UPDATE orders SET status='PAID' WHERE id=?`, [orderId]);
      status = 'PAID';

      for (const r of items) {
    await conn.execute(
      `INSERT IGNORE INTO user_games (user_id, game_id, purchased_at)
       VALUES (?, ?, NOW())`,
      [userId, r.gameId]
    );
  }
    }

    if (codeId) {
      await conn.execute(
        `INSERT INTO code_redemptions (code_id, user_id, order_id)
         VALUES (?, ?, ?)`,
        [codeId, userId, orderId]
      );
      await conn.execute(
        `UPDATE discount_codes SET used_count = used_count + 1 WHERE id=?`,
        [codeId]
      );
    }

    await conn.execute(
      `DELETE FROM cart_items WHERE user_id=? AND id IN (${itemIds.map(()=>'?').join(',')})`,
      [userId, ...itemIds]
    );

    await conn.commit();
    return res.json({ ok: true, orderId, status, total });
  } catch (e: any) {
    await conn.rollback();
    console.error('[cart checkout] error:', e);
    return res.status(400).json({ ok: false, error: e?.message || 'checkout failed' });
  } finally {
    conn.release();
  }
});

export default router;
