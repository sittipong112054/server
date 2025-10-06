import pool from "../db";


export type Product = {
  id?: number;
  title: string;
  price: number;
  image_url?: string | null;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string | null;
};

export async function listProducts(): Promise<Product[]> {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
  return rows as Product[];
}

export async function getProductById(id: number): Promise<Product | null> {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const list = rows as Product[];
  return list.length ? list[0] : null;
}

export async function createProduct(p: Product): Promise<number> {
  const [res] = await pool.execute(
    `INSERT INTO products (title, price, image_url, description, status)
     VALUES (?, ?, ?, ?, ?)`,
    [p.title, p.price, p.image_url ?? null, p.description ?? null, p.status ?? 'ACTIVE']
  );
  // @ts-ignore
  return res.insertId as number;
}

export async function updateProduct(id: number, p: Partial<Product>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(p)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(id);
  await pool.execute(`UPDATE products SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
}

export async function deleteProduct(id: number): Promise<void> {
  await pool.execute('DELETE FROM products WHERE id = ?', [id]);
}
