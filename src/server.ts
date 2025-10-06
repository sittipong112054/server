import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/auth";
import usersRouter from './routes/users';
import pool from "./db";

const app = express();

app.use(
  cors({
    origin: "http://localhost:4200",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Disposition"],
  })
);

app.options('*', cors({
  origin: 'http://localhost:4200',
  credentials: true
}));

app.get('/', (req, res) => {
  res.send('Hello Game Shop');
});


app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT NOW() as now');
        res.json({
            status: 'ok',
            now: (rows as any)[0].now
        });
    } catch (err) {
        console.error('[DB] connection error', err);
        res.status(500).json({
            status: 'error',
            message: err instanceof Error ? err.message : String(err)
        });
    }
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/auth", authRoutes);
app.use('/users', usersRouter);

app.listen(3002, () => {
  console.log("Auth server listening on 3002");
});
