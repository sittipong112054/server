import express from "express";
import pool from "../../db";

const router = express.Router();

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
const toUrl = (p?: string | null) =>
  p ? `${PUBLIC_BASE}/${String(p).replace(/^\/?/, "")}` : null;

function parseDateMaybe(s: unknown): Date | undefined {
  if (!s) return undefined;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? undefined : d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

router.get("/top", async (req, res) => {
  try {
    const startDate = parseDateMaybe(req.query.start);
    const endDate = parseDateMaybe(req.query.end);

    const sortParam = String(req.query.sort || "qty").toLowerCase();
    const sort = sortParam === "revenue" ? "revenue" : "qty_sold";
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 100)));

    let where = `WHERE o.status = 'PAID'`;
    const params: any[] = [];

    if (startDate && endDate) {
      where += ` AND DATE(o.created_at) BETWEEN ? AND ?`;
      params.push(ymd(startDate), ymd(endDate));
    } else if (startDate) {
      where += ` AND DATE(o.created_at) >= ?`;
      params.push(ymd(startDate));
    } else if (endDate) {
      where += ` AND DATE(o.created_at) <= ?`;
      params.push(ymd(endDate));
    }

    const sql = `
      SELECT
        g.id                               AS gameId,
        g.title                            AS title,
        g.image_path                       AS imagePath,
        COALESCE(SUM(oi.qty), 0)           AS qty_sold,
        COALESCE(SUM(oi.subtotal), 0)      AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN games g        ON g.id = oi.game_id
      ${where}
      GROUP BY g.id, g.title, g.image_path
      ORDER BY ${sort} DESC
      LIMIT ${limit}
    `;

    const [rows] = await pool.execute<any[]>(sql, params);

    const data = (rows || []).map((r, i) => ({
      gameId: Number(r.gameId),
      title: r.title,
      cover: toUrl(r.imagePath),
      qty: Number(r.qty_sold || 0),
      revenue: Number(r.revenue || 0),
      rank: i + 1,
    }));

    res.json({
      ok: true,
      data,
      start: startDate ? ymd(startDate) : null,
      end: endDate ? ymd(endDate) : null,
      sort: sort === "revenue" ? "revenue" : "qty",
    });
  } catch (e) {
    console.error("[public rankings/top] error", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

router.get("/kpis", async (req, res) => {
  try {
    const startDate = parseDateMaybe(req.query.start);
    const endDate = parseDateMaybe(req.query.end);

    let whereOrders = `WHERE status='PAID'`;
    let whereItems = `WHERE o.status='PAID'`;
    const paramsA: any[] = [];
    const paramsB: any[] = [];
    const paramsTop: any[] = [];

    if (startDate && endDate) {
      whereOrders += ` AND DATE(created_at) BETWEEN ? AND ?`;
      whereItems += ` AND DATE(o.created_at) BETWEEN ? AND ?`;
      paramsA.push(ymd(startDate), ymd(endDate));
      paramsB.push(ymd(startDate), ymd(endDate));
      paramsTop.push(ymd(startDate), ymd(endDate));
    } else if (startDate) {
      whereOrders += ` AND DATE(created_at) >= ?`;
      whereItems += ` AND DATE(o.created_at) >= ?`;
      paramsA.push(ymd(startDate));
      paramsB.push(ymd(startDate));
      paramsTop.push(ymd(startDate));
    } else if (endDate) {
      whereOrders += ` AND DATE(created_at) <= ?`;
      whereItems += ` AND DATE(o.created_at) <= ?`;
      paramsA.push(ymd(endDate));
      paramsB.push(ymd(endDate));
      paramsTop.push(ymd(endDate));
    }

    const [revRows] = await pool.execute<any[]>(
      `
      SELECT
        COALESCE(SUM(total_paid),0) AS total_revenue,
        COUNT(*)                    AS orders_count,
        COALESCE(AVG(total_paid),0) AS avg_order_value
      FROM orders
      ${whereOrders}
      `,
      paramsA
    );

    const [qtyRows] = await pool.execute<any[]>(
      `
      SELECT COALESCE(SUM(oi.qty),0) AS total_sales_qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      ${whereItems}
      `,
      paramsB
    );

    // ORDER BY qty_sold DESC     -- เรียงตามจำนวนยอดขาย
    // ORDER BY revenue DESC      -- เรียงตามรายได้รวม

    const [topRows] = await pool.execute<any[]>(
      `
      SELECT g.id AS gameId, g.title,
             SUM(oi.qty) AS qty_sold, SUM(oi.subtotal) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN games g ON g.id = oi.game_id
      ${whereItems}
      GROUP BY g.id, g.title
      ORDER BY qty_sold DESC
      LIMIT 1
      `,
      paramsTop
    );

    const r1 = revRows[0] || {
      total_revenue: 0,
      orders_count: 0,
      avg_order_value: 0,
    };
    const q1 = qtyRows[0] || { total_sales_qty: 0 };
    const t1 = topRows[0] || null;

    res.json({
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
      start: startDate ? ymd(startDate) : null,
      end: endDate ? ymd(endDate) : null,
    });
  } catch (e) {
    console.error("[public rankings/kpis] error:", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
