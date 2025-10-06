import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();
export const DB_SCHEMA = process.env.DB_NAME || 'db66011212054';
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3309,
  user: process.env.DB_USER || '66011212054',
  password: process.env.DB_PASS || '66011212054',
  database: DB_SCHEMA,
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
pool
  .getConnection()
  .then(() => console.log("[DB] Connected OK"))
  .catch((err) => console.error("[DB] Connection Error:", err));

(async () => {
  try {
    const [dbRow] = await pool.query(
      "SELECT DATABASE() AS db, @@hostname AS host"
    );
    console.log("[DB] Using:", (dbRow as any[])[0]);

    const [cnt] = await pool.query("SELECT COUNT(*) AS n FROM users");
    console.log("[DB] users.count =", (cnt as any[])[0]?.n);
  } catch (e) {
    console.error("[DB DEBUG ERROR]", e);
  }
})();
