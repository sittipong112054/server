import { Router } from 'express';
import productRoutes from './product.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'api', time: new Date().toISOString() });
});

router.use('/products', productRoutes);

export default router;
