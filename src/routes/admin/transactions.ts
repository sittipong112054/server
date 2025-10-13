import { Router } from "express";
import pool, { DB_SCHEMA } from "../../db";
import { requireAuth, requireAdmin } from "../../middlewares/authMiddleware";

const router = Router();

router.get("/users/:userId/transactions", requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid userId" });

  const [rows] = await pool.execute<any[]>(
    `SELECT id, type, amount, balance_after, note, created_at
     FROM \`${DB_SCHEMA}\`.wallet_transactions
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 200`,
    [userId]
  );

  res.json({ ok: true, data: rows });
});

export default router;
