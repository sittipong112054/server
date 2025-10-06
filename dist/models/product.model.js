"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProducts = listProducts;
exports.getProductById = getProductById;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
const db_1 = __importDefault(require("../db"));
async function listProducts() {
    const [rows] = await db_1.default.query('SELECT * FROM products ORDER BY id DESC');
    return rows;
}
async function getProductById(id) {
    const [rows] = await db_1.default.query('SELECT * FROM products WHERE id = ?', [id]);
    const list = rows;
    return list.length ? list[0] : null;
}
async function createProduct(p) {
    const [res] = await db_1.default.execute(`INSERT INTO products (title, price, image_url, description, status)
     VALUES (?, ?, ?, ?, ?)`, [p.title, p.price, p.image_url ?? null, p.description ?? null, p.status ?? 'ACTIVE']);
    // @ts-ignore
    return res.insertId;
}
async function updateProduct(id, p) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(p)) {
        fields.push(`${k} = ?`);
        values.push(v);
    }
    if (!fields.length)
        return;
    values.push(id);
    await db_1.default.execute(`UPDATE products SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
}
async function deleteProduct(id) {
    await db_1.default.execute('DELETE FROM products WHERE id = ?', [id]);
}
