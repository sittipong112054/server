import type { Request, Response } from 'express';
import { z } from 'zod';
import * as ProductModel from '../models/product.model';

const CreateProductDto = z.object({
  title: z.string().min(1),
  price: z.number().nonnegative(),
  image_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export async function list(req: Request, res: Response) {
  const items = await ProductModel.listProducts();
  res.json(items);
}

export async function get(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = await ProductModel.getProductById(id);
  if (!item) return res.status(404).json({ error: 'Product not found' });
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const parsed = CreateProductDto.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const id = await ProductModel.createProduct(parsed.data);
  const created = await ProductModel.getProductById(id);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const body = req.body;
  await ProductModel.updateProduct(id, body);
  const updated = await ProductModel.getProductById(id);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await ProductModel.deleteProduct(id);
  res.status(204).send();
}
