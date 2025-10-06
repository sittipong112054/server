# server (Node.js + Express + TypeScript + MySQL)

API backend สำหรับโปรเจกต์ `stream-website` (Angular) พร้อมเชื่อม MySQL

## 🚀 วิธีเริ่มต้น

1) ติดตั้ง dependencies
```bash
npm i
```

2) คัดลอกไฟล์ env ตัวอย่าง แล้วแก้ค่าตามเครื่องคุณ
```bash
cp .env.example .env
# จากนั้นแก้ .env (PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, CORS_ORIGIN)
```

3) สร้างฐานข้อมูลและตาราง
```bash
# เปิด MySQL client แล้วรัน:
source ./sql/schema.sql;
source ./sql/seed.sql;
```

4) รันโหมดพัฒนา
```bash
npm run dev
```

ถ้าเห็น `🚀 Server listening on http://localhost:3002` แปลว่า OK

5) ทดสอบ API
```bash
curl http://localhost:3002/api/health
curl http://localhost:3002/api/products
```

## 🔗 ใช้งานร่วมกับ Angular (ตัวอย่าง)
ใน Angular service ตั้งค่า endpoint ไปที่ `http://localhost:3002/api`  
เช่น GET สินค้า:
```ts
this.http.get<Product[]>('http://localhost:3002/api/products')
```

## 📦 โครงสร้างโฟลเดอร์
```
server/
├─ src/
│  ├─ controllers/
│  │  └─ product.controller.ts
│  ├─ middlewares/
│  │  └─ error.ts
│  ├─ models/
│  │  └─ product.model.ts
│  ├─ routes/
│  │  ├─ index.ts
│  │  └─ product.routes.ts
│  ├─ db.ts
│  └─ server.ts
├─ sql/
│  ├─ schema.sql
│  └─ seed.sql
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ README.md
```

## ✨ Endpoints (เบื้องต้น)
- `GET /api/health`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`

> ถ้าคุณอยากเพิ่ม `users`, `orders`, `auth (JWT)` บอกได้เลย เดี๋ยวผม scaffold ให้ต่อ
