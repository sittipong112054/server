import { Router } from "express";
import pool, { DB_SCHEMA } from "../../db";
import { requireAuth, requireAdmin } from "../../middlewares/authMiddleware";

const router = Router();

// GET /admin/users/:userId/transactions/summary
router.get("/users/:userId/transactions/summary", requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);

  // ก่อนดึงสรุป/ธุรกรรม เช็คบทบาทของ target user
const [u] = await pool.execute<any[]>(
  `SELECT role FROM \`${DB_SCHEMA}\`.users WHERE id = ? LIMIT 1`,
  [userId]
);
if (!u.length || u[0].role !== 'USER') {
  return res.status(404).json({ error: "User not found" });
}

  if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid userId" });

  const [rows] = await pool.execute<any[]>(
    `SELECT
       COUNT(*)                              AS total_count,
       COALESCE(AVG(amount), 0)             AS avg_amount,
       -- รวมยอดเติมเงิน (เข้ากระเป๋า)
       COALESCE(SUM(CASE WHEN type='TOPUP'     THEN amount ELSE 0 END), 0) AS total_topup,
       -- รวมยอดซื้อเกม (เงินออก) — ในระบบเราบันทึก amount เป็นเลขบวก
       COALESCE(SUM(CASE WHEN type='PURCHASE'  THEN amount ELSE 0 END), 0) AS total_purchase
     FROM \`${DB_SCHEMA}\`.wallet_transactions
     WHERE user_id = ?`,
    [userId]
  );

  const r = rows[0] || {};
  res.json({
    ok: true,
    data: {
      totalCount: Number(r.total_count || 0),
      totalTopup: Number(r.total_topup || 0),
      totalPurchase: Number(r.total_purchase || 0),
      avgAmount: Number(r.avg_amount || 0),
    },
  });
});

export default router;
