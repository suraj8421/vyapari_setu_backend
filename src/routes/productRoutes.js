// ============================================
// Product Routes
// ============================================

import express from 'express';
import productController from '../controllers/productController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createProductSchema, updateProductSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// GET /api/products/categories
router.get('/categories', productController.getCategories);

// GET /api/products/low-stock
router.get('/low-stock', productController.getLowStock);

// POST /api/products - Allow authenticated users (Staff & Admin)
router.post('/', validateBody(createProductSchema), productController.create);

// GET /api/products
router.get('/', productController.getAll);

// GET /api/products/:id
router.get('/:id', productController.getById);

// PUT /api/products/:id - Allow authenticated users (Staff & Admin)
router.put('/:id', validateBody(updateProductSchema), productController.update);

// DELETE /api/products/:id - Admin only
router.delete('/:id', authorize('ADMIN'), productController.delete);

export default router;
