import express from "express";
import pool from "../db";

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
0
router.get("/top", async (req, res) => {
  try {
    const parseDateMaybe = (s: unknown) => {
      if (!s) return undefined;
      const d = new Date(String(s));
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const startDate = parseDateMaybe(req.query.start);
    const endDate   = parseDateMaybe(req.query.end);
    const sortParam = String(req.query.sort || "qty").toLowerCase();
    const sort = sortParam === "revenue" ? "revenue" : "qty_sold";
    const limit = Math.max(1, Math.min(10000, Number(req.query.limit ?? 10000)));
    const whereDateOn = [
      startDate ? `AND DATE(o.created_at) >= ?` : ``,
      endDate   ? `AND DATE(o.created_at) <= ?` : ``,
    ].join(" ");

    const params: any[] = [];
    if (startDate) params.push(ymd(startDate));
    if (endDate)   params.push(ymd(endDate));

    const sql = `
      SELECT
        g.id                               AS gameId,
        g.title                            AS title,
        g.image_path                       AS imagePath,
        COALESCE(SUM(oi.qty), 0)           AS qty_sold,
        COALESCE(SUM(oi.subtotal), 0)      AS revenue
      FROM games g
      LEFT JOIN order_items oi
        ON oi.game_id = g.id
      LEFT JOIN orders o
        ON o.id = oi.order_id
       AND o.status = 'PAID'
       ${whereDateOn}
      GROUP BY g.id, g.title, g.image_path
      ORDER BY ${sort} DESC, g.title ASC
      LIMIT ${limit}
    `;

    const [rows] = await pool.execute<any[]>(sql, params);

    const toUrl = (p?: string | null) =>
      p ? `${(process.env.PUBLIC_BASE_URL ?? "http://localhost:3002")}/${String(p).replace(/^\/?/, "")}` : null;

    const data = (rows || []).map((r: any, i: number) => ({
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
      sort: sortParam === "revenue" ? "revenue" : "qty",
    });
  } catch (e) {
    console.error("[public rankings/top] error", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
