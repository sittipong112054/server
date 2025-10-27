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

const toNullIfEmpty = (s: any) => {
  if (s == null) return null;
  const v = String(s).trim();
  return v ? v : null;
};

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
  try {
    await pool.execute(`
      UPDATE discount_codes
      SET active = 0
      WHERE (end_at IS NOT NULL AND end_at < NOW())
         OR (max_uses IS NOT NULL AND used_count >= max_uses)
    `);

    const [rows] = await pool.execute(`
      SELECT id, code, description, discount_type, discount_value,
             max_uses, per_user_limit, used_count, active,
             start_at, end_at, created_at
      FROM discount_codes
      ORDER BY id DESC
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("[dc list]", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});


// ---------- GET ONE ----------
router.get("/discount-codes/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }
  try {
    const [rows] = await pool.execute(
      `SELECT id, code, description, discount_type, discount_value,
              max_uses, per_user_limit, used_count, active,
              start_at, end_at, created_at
       FROM discount_codes WHERE id=? LIMIT 1`,
      [id]
    );
    const r = (rows as any[])[0];
    if (!r) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, data: r });
  } catch (e) {
    console.error("[dc get]", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});


// ---------- CREATE ----------
router.post("/discount-codes", requireAuth, requireAdmin, async (req, res) => {
  const b: Body = req.body ?? {};
  const errors = validate(b);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors.join(", ") });
  }

  const startAt = toNullIfEmpty(b.start_at);
  const endAt = toNullIfEmpty(b.end_at);

  try {
    const [result]: any = await pool.execute(
      `INSERT INTO discount_codes
       (code, description, discount_type, discount_value,
        max_uses, per_user_limit, active, start_at, end_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        b.code.trim(),
        b.description ?? null,
        b.discount_type,
        Number(b.discount_value),
        b.max_uses == null ? null : Math.floor(Number(b.max_uses)),
        b.per_user_limit == null ? 1 : Math.max(1, Math.floor(Number(b.per_user_limit))),
        b.active ?? true,
        startAt,
        endAt,
      ]
    );
    const id = result.insertId;
    // ส่งข้อมูลกลับให้ UI ใช้รีเฟรชแถวได้ทันที
    res.status(201).json({
      ok: true,
      data: {
        id,
        code: b.code.trim(),
        description: b.description ?? null,
        discount_type: b.discount_type,
        discount_value: Number(b.discount_value),
        max_uses: b.max_uses == null ? null : Math.floor(Number(b.max_uses)),
        per_user_limit: b.per_user_limit == null ? 1 : Math.max(1, Math.floor(Number(b.per_user_limit))),
        active: b.active ?? true,
        start_at: startAt,
        end_at: endAt,
      },
    });
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
    console.error("[dc create]", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});


// ---------- UPDATE ----------
router.put("/discount-codes/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const b: Partial<Body> = req.body ?? {};
  if (b.discount_type && !["PERCENT", "AMOUNT"].includes(b.discount_type)) {
    return res.status(400).json({ ok: false, error: "discount_type invalid" });
  }

  const fields: string[] = [];
  const params: any[] = [];
  const push = (f: string, v: any) => { fields.push(`${f}=?`); params.push(v); };

  if (b.code != null)           push("code", String(b.code).trim());
  if (b.description !== undefined) push("description", b.description ?? null);
  if (b.discount_type)          push("discount_type", b.discount_type);
  if (b.discount_value != null) push("discount_value", Number(b.discount_value));
  if (b.max_uses !== undefined) push("max_uses", b.max_uses == null ? null : Math.floor(Number(b.max_uses)));
  if (b.per_user_limit !== undefined)
                                push("per_user_limit", b.per_user_limit == null ? 1 : Math.max(1, Math.floor(Number(b.per_user_limit))));
  if (b.active !== undefined)   push("active", b.active ? 1 : 0);
  if (b.start_at !== undefined) push("start_at", toNullIfEmpty(b.start_at));
  if (b.end_at !== undefined)   push("end_at", toNullIfEmpty(b.end_at));

  if (!fields.length) return res.json({ ok: true }); // no changes

  try {
    const sql = `UPDATE discount_codes SET ${fields.join(", ")} WHERE id=?`;
    params.push(id);
    await pool.execute(sql, params);
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY")
      return res.status(409).json({ ok: false, error: "code already exists" });
    console.error("[dc update]", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});


// ---------- DELETE ----------
router.delete("/discount-codes/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }
  try {
    const [rows] = await pool.execute(
      "SELECT id, used_count FROM discount_codes WHERE id=? LIMIT 1",
      [id]
    );
    const cur = (rows as any[])[0];
    if (!cur) return res.status(404).json({ ok: false, error: "not found" });
    if (Number(cur.used_count) > 0) {
      return res.status(400).json({ ok: false, error: "cannot delete a code that has been used" });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute("DELETE FROM code_redemptions WHERE code_id=?", [id]);
      await conn.execute("DELETE FROM discount_codes WHERE id=?", [id]);
      await conn.commit();
      conn.release();
      return res.json({ ok: true });
    } catch (e) {
      try { await (conn as any).rollback(); } catch {}
      try { (conn as any).release(); } catch {}
      console.error("[dc delete tx]", e);
      return res.status(500).json({ ok: false, error: "server error" });
    }
  } catch (e) {
    console.error("[dc delete]", e);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});



export default router;
