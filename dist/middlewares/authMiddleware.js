"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const db_1 = __importDefault(require("../db"));
async function requireAuth(req, res, next) {
    try {
        const auth = req.headers['authorization']?.toString() ?? '';
        const bearer = auth.toLowerCase().startsWith('bearer ')
            ? auth.slice(7).trim()
            : undefined;
        const token = req.cookies?.session_token || bearer;
        if (!token)
            return res.status(401).json({ error: 'Not authenticated' });
        const [rows] = await db_1.default.execute(`SELECT s.id AS sid, s.expires_at, s.revoked_at,
              u.id, u.username, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.session_token = ?
        LIMIT 1`, [token]);
        const r = rows[0];
        if (!r)
            return res.status(401).json({ error: 'Invalid session' });
        if (r.revoked_at)
            return res.status(401).json({ error: 'Session revoked' });
        if (r.expires_at && new Date(r.expires_at) < new Date())
            return res.status(401).json({ error: 'Session expired' });
        req.user = { id: r.id, username: r.username, role: r.role };
        next();
    }
    catch (err) {
        console.error('[requireAuth] error', err);
        res.status(500).json({ error: 'Server error' });
    }
}
function requireAdmin(req, res, next) {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    if (user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
}
