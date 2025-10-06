import type { Request, Response, NextFunction } from 'express';

export function notFound(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err);
  const status = err?.status || 500;
  res.status(status).json({
    error: err?.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err : undefined,
  });
}
