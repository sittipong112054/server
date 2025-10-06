"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_routes_js_1 = __importDefault(require("./product.routes.js"));
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'api', time: new Date().toISOString() });
});
router.use('/products', product_routes_js_1.default);
exports.default = router;
