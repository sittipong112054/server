"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.list = list;
exports.get = get;
exports.create = create;
exports.update = update;
exports.remove = remove;
const zod_1 = require("zod");
const ProductModel = __importStar(require("../models/product.model"));
const CreateProductDto = zod_1.z.object({
    title: zod_1.z.string().min(1),
    price: zod_1.z.number().nonnegative(),
    image_url: zod_1.z.string().url().optional().or(zod_1.z.literal('').transform(() => undefined)),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
async function list(req, res) {
    const items = await ProductModel.listProducts();
    res.json(items);
}
async function get(req, res) {
    const id = Number(req.params.id);
    const item = await ProductModel.getProductById(id);
    if (!item)
        return res.status(404).json({ error: 'Product not found' });
    res.json(item);
}
async function create(req, res) {
    const parsed = CreateProductDto.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const id = await ProductModel.createProduct(parsed.data);
    const created = await ProductModel.getProductById(id);
    res.status(201).json(created);
}
async function update(req, res) {
    const id = Number(req.params.id);
    const body = req.body;
    await ProductModel.updateProduct(id, body);
    const updated = await ProductModel.getProductById(id);
    res.json(updated);
}
async function remove(req, res) {
    const id = Number(req.params.id);
    await ProductModel.deleteProduct(id);
    res.status(204).send();
}
