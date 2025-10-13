import express from "express";
import pool from "../../db";
import { requireAuth, requireAdmin } from "../../middlewares/authMiddleware";

const router = express.Router();

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
const toUrl = (p?: string | null) =>
  p ? `${PUBLIC_BASE}/${String(p).replace(/^\/?/, "")}` : null;

function parseDate(s: unknown, def: Date) {
  if (!s) return def;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? def : d;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

router.get('/rankings/top', requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const start = parseDate(req.query.start, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const end   = parseDate(req.query.end,   now);
    const startStr = ymd(start);
    const endStr   = ymd(end);

    const sort  = String(req.query.sort || 'qty').toLowerCase() === 'revenue' ? 'revenue' : 'qty';
    const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 5)));

    console.log(`[rankings/top] start=${startStr}, end=${endStr}, limit=${limit}, sort=${sort}`);

    const [rows] = await pool.execute<any[]>(
      `
      SELECT
        g.id             AS gameId,
        g.title          AS title,
        g.image_path     AS imagePath,
        SUM(oi.qty)      AS qty_sold,
        SUM(oi.subtotal) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN games g        ON g.id = oi.game_id
      WHERE o.status = 'PAID'
        AND DATE(o.created_at) BETWEEN ? AND ?
      GROUP BY g.id, g.title, g.image_path
      ORDER BY ${sort === 'revenue' ? 'revenue DESC' : 'qty_sold DESC'}
      LIMIT ${limit}
      `,
      [startStr, endStr]
    );

    const data = rows.map(r => ({
      gameId: Number(r.gameId),
      title: r.title,
      cover: toUrl(r.imagePath),
      qty: Number(r.qty_sold || 0),
      revenue: Number(r.revenue || 0),
    }));

    return res.json({ ok: true, data, start: startStr, end: endStr, sort });
  } catch (e) {
    console.error('[rankings/top] error', e);
    return res.status(500).json({ ok: false, error: 'server error' });
  }
});


router.get("/rankings/kpis", requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const start = parseDate(
      req.query.start,
      new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );
    const end = parseDate(req.query.end, now);
    const startStr = ymd(start);
    const endStr = ymd(end);

    const [revRows] = await pool.execute<any[]>(
      `
      SELECT
        COALESCE(SUM(total_paid),0)          AS total_revenue,
        COUNT(*)                              AS orders_count,
        COALESCE(AVG(total_paid),0)          AS avg_order_value
      FROM orders
      WHERE status='PAID'
        AND DATE(created_at) BETWEEN ? AND ?
      `,
      [startStr, endStr]
    );

    const [qtyRows] = await pool.execute<any[]>(
      `
      SELECT COALESCE(SUM(oi.qty),0) AS total_sales_qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status='PAID'
        AND DATE(o.created_at) BETWEEN ? AND ?
      `,
      [startStr, endStr]
    );

    const [topRows] = await pool.execute<any[]>(
      `
      SELECT g.id AS gameId, g.title,
             SUM(oi.qty) AS qty_sold, SUM(oi.subtotal) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN games g ON g.id = oi.game_id
      WHERE o.status='PAID'
        AND DATE(o.created_at) BETWEEN ? AND ?
      GROUP BY g.id, g.title
      ORDER BY qty_sold DESC
      LIMIT 1
      `,
      [startStr, endStr]
    );

    const r1 = revRows[0] || {
      total_revenue: 0,
      orders_count: 0,
      avg_order_value: 0,
    };
    const q1 = qtyRows[0] || { total_sales_qty: 0 };
    const t1 = topRows[0] || null;

    return res.json({
      ok: true,
      data: {
        totalRevenue: Number(r1.total_revenue || 0),
        totalSales: Number(q1.total_sales_qty || 0),
        avgRevenue: Number(r1.avg_order_value || 0),
        topSeller: t1
          ? {
              gameId: Number(t1.gameId),
              title: t1.title,
              qty: Number(t1.qty_sold || 0),
              revenue: Number(t1.revenue || 0),
            }
          : null,
      },
      start: startStr,
      end: endStr,
    });
  } catch (e) {
    console.error("[rankings/kpis] error:", e);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
