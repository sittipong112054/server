"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/users.ts
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = __importDefault(require("../db"));
const upload_1 = require("../middlewares/upload");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:3002";
function toRelativeAvatar(fileName) {
    return path_1.default.join("uploads", "avatars", fileName).replace(/\\/g, "/");
}
function rmIfExists(absPath) {
    try {
        if (fs_1.default.existsSync(absPath))
            fs_1.default.unlinkSync(absPath);
    }
    catch (e) {
        console.warn("[users] unlink error:", e);
    }
}
router.post('/me/avatar', authMiddleware_1.requireAuth, upload_1.avatarUpload.single('avatar'), async (req, res) => {
    try {
        const me = req.user;
        if (!req.file)
            return res.status(400).json({ message: 'No file' });
        const [rows] = await db_1.default.execute('SELECT avatar_path FROM users WHERE id = ?', [me.id]);
        const old = rows[0]?.avatar_path;
        if (old) {
            const oldPath = path_1.default.join(process.cwd(), old);
            if (fs_1.default.existsSync(oldPath))
                fs_1.default.unlinkSync(oldPath);
        }
        const relative = path_1.default.join('uploads', 'avatars', req.file.filename).replace(/\\/g, '/');
        await db_1.default.execute('UPDATE users SET avatar_path = ? WHERE id = ?', [relative, me.id]);
        const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3002';
        res.json({
            ok: true,
            avatarUrl: `${PUBLIC_BASE}/${relative}`, // ✅ ส่ง URL เต็มกลับ Angular
        });
    }
    catch (e) {
        console.error('[users.me/avatar POST] error', e);
        res.status(500).json({ message: 'Server error' });
    }
});
router.get('/me', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const me = req.user;
        const [rows] = await db_1.default.execute('SELECT id, username, email, wallet_balance, avatar_path FROM users WHERE id = ?', [me.id]);
        const u = rows[0];
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
    }
    catch (e) {
        console.error('[users/me GET] error', e);
        res.status(500).json({ message: 'Server error' });
    }
});
// src/routes/users.ts
router.put('/me', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const me = req.user; // มาจาก requireAuth
        const { username, email } = req.body ?? {};
        if (username && typeof username !== 'string') {
            return res.status(400).json({ message: 'Invalid username' });
        }
        if (email && typeof email !== 'string') {
            return res.status(400).json({ message: 'Invalid email' });
        }
        await db_1.default.execute(`UPDATE users
       SET username = COALESCE(?, username),
           email    = COALESCE(?, email)
       WHERE id = ?`, [username ?? null, email ?? null, me.id]);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('[users/me PUT] error', e);
        res.status(500).json({ message: 'Server error' });
    }
});
// ลบรูปโปรไฟล์ตัวเอง (กลับไปใช้ default)
router.delete("/me/avatar", authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const me = req.user;
        const [rows] = await db_1.default.execute("SELECT avatar_path FROM users WHERE id = ?", [me.id]);
        const cur = rows[0]?.avatar_path;
        if (cur)
            rmIfExists(path_1.default.join(process.cwd(), cur));
        await db_1.default.execute("UPDATE users SET avatar_path = NULL WHERE id = ?", [
            me.id,
        ]);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[users.me/avatar DELETE] error", e);
        res.status(500).json({ message: "Server error" });
    }
});
// ---------- ADMIN SCOPE ----------
// แก้ไขข้อมูลผู้ใช้ตาม id
router.put("/:id", authMiddleware_1.requireAdmin, async (req, res) => {
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
        await db_1.default.execute(`UPDATE users
     SET username = COALESCE(?, username),
         email    = COALESCE(?, email),
         role     = COALESCE(?, role),
         status   = COALESCE(?, status)
   WHERE id = ?`, [username ?? null, email ?? null, role ?? null, status ?? null, id]);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin users/:id PUT] error", e);
        res.status(500).json({ message: "Server error" });
    }
});
// อัปโหลด/เปลี่ยนรูปผู้ใช้ตาม id
router.post("/:id/avatar", authMiddleware_1.requireAdmin, upload_1.avatarUpload.single("avatar"), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file)
            return res.status(400).json({ message: "No file" });
        const [rows] = await db_1.default.execute("SELECT avatar_path FROM users WHERE id = ?", [id]);
        const old = rows[0]?.avatar_path;
        if (old)
            rmIfExists(path_1.default.join(process.cwd(), old));
        const relative = toRelativeAvatar(req.file.filename);
        await db_1.default.execute("UPDATE users SET avatar_path = ? WHERE id = ?", [
            relative,
            id,
        ]);
        res.json({ ok: true, avatarUrl: `${PUBLIC_BASE}/${relative}` });
    }
    catch (e) {
        console.error("[admin users/:id/avatar POST] error", e);
        res.status(500).json({ message: "Server error" });
    }
});
// ลบรูปผู้ใช้ตาม id
router.delete("/:id/avatar", authMiddleware_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db_1.default.execute("SELECT avatar_path FROM users WHERE id = ?", [id]);
        const cur = rows[0]?.avatar_path;
        if (cur)
            rmIfExists(path_1.default.join(process.cwd(), cur));
        await db_1.default.execute("UPDATE users SET avatar_path = NULL WHERE id = ?", [
            id,
        ]);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin users/:id/avatar DELETE] error", e);
        res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
