import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/auth";
import usersRouter from "./routes/users";
import pool from "./db";
import games from "./routes/admin/games";
import categories from "./routes/categories";
import store from "./routes/store";
import adminGamesRouter from "./routes/admin/games";
import publicGamesRouter from "./routes/game-public";
import adminUsersRouter from "./routes/users";
import adminTxRouter from "./routes/admin/transactions";
import adminTxSummaryRouter from "./routes/admin/transactions.summary";
import cart from "./routes/cart";
import meRouter from './routes/me';
import adminDiscountRoutes from './routes/admin/discount-codes';
import rankingsPublicRouter from './routes/rankings';
import adminRankingsRoutes from './routes/admin/rankings';

const app = express();
const isProd = process.env.NODE_ENV === "production";

// ✅ อยู่หลัง proxy (เช่น Render) เพื่อให้ Secure cookie ใช้งานได้
app.set("trust proxy", 1);

// ✅ ระบุ origin ให้ครบ และรองรับทั้ง dev/prod
const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://server-1d8o.onrender.com", // ใส่โดเมนจริงของ frontend
];


app.use(cors({
  origin: (origin, cb) => {
    // อนุญาต no-origin (curl/Postman) และ whitelist ตรง ๆ
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With","Accept"],
  exposedHeaders: ["Content-Disposition"],
}));

app.options("*", cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.get("/", (req, res) => {
  res.send("Hello Game Shop");
});

app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() as now");
    res.json({
      status: "ok",
      now: (rows as any)[0].now,
    });
  } catch (err) {
    console.error("[DB] connection error", err);
    res.status(500).json({
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/admin/games", games);
app.use("/categories", categories);
app.use("/store", store);

app.use("/admin", adminUsersRouter);
app.use("/admin", adminTxRouter);
app.use("/admin", adminTxSummaryRouter);

app.use("/admin/games", adminGamesRouter);
app.use("/games", publicGamesRouter);
app.use('/admin', adminDiscountRoutes);

app.use('/me', meRouter);
app.use('/rankings', rankingsPublicRouter);
app.use('/admin/rankings', adminRankingsRoutes);
app.use('/cart', cart);

app.use("/", store);
app.use("/auth", authRoutes);
app.use("/users", usersRouter);

app.listen(3002, () => {
  console.log("Auth server listening on 3002");
});
