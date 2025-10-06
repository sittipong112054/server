"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB_SCHEMA = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.DB_SCHEMA = process.env.DB_NAME || 'db66011212054';
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3309,
    user: process.env.DB_USER || '66011212054',
    password: process.env.DB_PASS || '66011212054',
    database: exports.DB_SCHEMA,
    waitForConnections: true,
    connectionLimit: 10,
});
exports.default = pool;
pool
    .getConnection()
    .then(() => console.log("[DB] Connected OK"))
    .catch((err) => console.error("[DB] Connection Error:", err));
(async () => {
    try {
        const [dbRow] = await pool.query("SELECT DATABASE() AS db, @@hostname AS host");
        console.log("[DB] Using:", dbRow[0]);
        const [cnt] = await pool.query("SELECT COUNT(*) AS n FROM users");
        console.log("[DB] users.count =", cnt[0]?.n);
    }
    catch (e) {
        console.error("[DB DEBUG ERROR]", e);
    }
})();
