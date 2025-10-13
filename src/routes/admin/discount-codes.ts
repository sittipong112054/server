import express from "express";
import pool from "../../db";
import { requireAuth, requireAdmin } from "../../middlewares/authMiddleware";

const router = express.Router();

type Body = {
  code: string;
  description?: string | null;
  discount_type: "PERCENT" | "AMOUNT";
  discount_value: number;
  max_uses?: number | null;
  per_user_limit?: number | null;
  active?: boolean;
  start_at?: string | null; // ISO (yyyy-MM-ddTHH:mm)
  end_at?: string | null;
};

function toNum(n: any, def: number | null = null) {
  const v = Number(n);
  return Number.isFinite(v) ? v : def;
}

function isIsoDateTime(s: unknown): boolean {
  if (s == null || s === "") return true; // ปล่อยว่างได้
  if (typeof s !== "string") return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function validate(b: Partial<Body>) {
  const err: string[] = [];

  // code
  if (!b.code || typeof b.code !== "string" || !b.code.trim()) {
    err.push("code is required");
  }

  // type
  if (!b.discount_type || !["PERCENT", "AMOUNT"].includes(b.discount_type)) {
    err.push("discount_type invalid");
  }

  // value
  const val = toNum(b.discount_value, NaN);
  if (!Number.isFinite(val) || val! <= 0) {
    err.push("discount_value invalid");
  }
  if (b.discount_type === "PERCENT" && (val! < 1 || val! > 100)) {
    err.push("percent 1-100");
  }

  // max_uses (optional: integer >= 0)
  if (b.max_uses != null) {
    const max = toNum(b.max_uses, NaN);
    if (!Number.isFinite(max) || max! < 0 || !Number.isInteger(max)) {
      err.push("max_uses invalid");
    }
  }

  // per_user_limit (optional: integer >= 1)
  if (b.per_user_limit != null) {
    const lim = toNum(b.per_user_limit, NaN);
    if (!Number.isFinite(lim) || lim! < 1 || !Number.isInteger(lim)) {
      err.push("per_user_limit invalid");
    }
  }

  // active (optional boolean)
  if (b.active != null && typeof b.active !== "boolean") {
    err.push("active must be boolean");
  }

  // start/end (optional ISO)
  if (!isIsoDateTime(b.start_at)) err.push("start_at invalid");
  if (!isIsoDateTime(b.end_at)) err.push("end_at invalid");

  return err;
}

// ---------- LIST ----------
router.get("/discount-codes", requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute(`
    SELECT id, code, description, discount_type, discount_value,
           max_uses, per_user_limit, used_count, active,
           start_at, end_at, created_at
    FROM discount_codes
    ORDER BY id DESC
  `);
  res.json({ ok: true, data: rows });
});

// ---------- GET ONE ----------
router.get(
  "/discount-codes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, code, description, discount_type, discount_value,
            max_uses, per_user_limit, used_count, active,
            start_at, end_at, created_at
     FROM discount_codes WHERE id=? LIMIT 1`,
      [req.params.id]
    );
    const r = (rows as any[])[0];
    if (!r) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, data: r });
  }
);

// ---------- CREATE ----------
router.post("/discount-codes", requireAuth, requireAdmin, async (req, res) => {
  const b: Body = req.body ?? {};
  const errors = validate(b);
  if (errors.length)
    return res.status(400).json({ ok: false, error: errors.join(", ") });

  try {
    await pool.execute(
      `INSERT INTO discount_codes
   (code, description, discount_type, discount_value,
    max_uses, per_user_limit, active, start_at, end_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        b.code.trim(), // หรือ b.code.trim().toUpperCase()
        b.description ?? null,
        b.discount_type,
        Number(b.discount_value),
        b.max_uses == null ? null : Math.floor(Number(b.max_uses)),
        b.per_user_limit == null
          ? 1
          : Math.max(1, Math.floor(Number(b.per_user_limit))),
        b.active ?? true,
        b.start_at ?? null,
        b.end_at ?? null,
      ]
    );
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
    console.error("[dc create]", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

// ---------- UPDATE ----------
router.put(
  "/discount-codes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const b: Partial<Body> = req.body ?? {};
    // อนุญาตแก้บาง field ก็ได้ — ที่นี่ตรวจ quick
    if (b.discount_type && !["PERCENT", "AMOUNT"].includes(b.discount_type)) {
      return res
        .status(400)
        .json({ ok: false, error: "discount_type invalid" });
    }

    const fields: string[] = [];
    const params: any[] = [];
    const push = (f: string, v: any) => {
      fields.push(`${f}=?`);
      params.push(v);
    };

    if (b.code != null) push("code", String(b.code).trim());
    if (b.description !== undefined) push("description", b.description ?? null);
    if (b.discount_type) push("discount_type", b.discount_type);
    if (b.discount_value != null)
      push("discount_value", Number(b.discount_value));
    if (b.max_uses !== undefined)
      push(
        "max_uses",
        b.max_uses == null ? null : Math.floor(Number(b.max_uses))
      );
    if (b.per_user_limit !== undefined)
      push(
        "per_user_limit",
        b.per_user_limit == null
          ? 1
          : Math.max(1, Math.floor(Number(b.per_user_limit)))
      );
    if (b.active !== undefined) push("active", !!b.active);
    if (b.start_at !== undefined) push("start_at", b.start_at ?? null);
    if (b.end_at !== undefined) push("end_at", b.end_at ?? null);

    if (!fields.length) return res.json({ ok: true }); // nothing changed

    try {
      const sql = `UPDATE discount_codes SET ${fields.join(", ")} WHERE id=?`;
      params.push(req.params.id);
      await pool.execute(sql, params);
      res.json({ ok: true });
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return res
          .status(409)
          .json({ ok: false, error: "code already exists" });
      }
      console.error("[dc update]", e);
      res.status(500).json({ ok: false, error: "server error" });
    }
  }
);

// ---------- DELETE ----------
router.delete(
  "/discount-codes/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    await pool.execute(`DELETE FROM discount_codes WHERE id=?`, [
      req.params.id,
    ]);
    res.json({ ok: true });
  }
);

export default router;
