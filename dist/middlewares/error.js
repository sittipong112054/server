"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
function notFound(req, res, _next) {
    res.status(404).json({ error: 'Route not found' });
}
function errorHandler(err, _req, res, _next) {
    console.error('[ERROR]', err);
    const status = err?.status || 500;
    res.status(status).json({
        error: err?.message || 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err : undefined,
    });
}
