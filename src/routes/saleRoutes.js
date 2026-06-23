// ============================================
// Sale Routes
// ============================================

import express from 'express';
import saleController from '../controllers/saleController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSaleSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// POST /api/sales
router.post('/', validateBody(createSaleSchema), saleController.create);

// GET /api/sales
router.get('/', saleController.getAll);

// GET /api/sales/:id
router.get('/:id', saleController.getById);

// PATCH /api/sales/:id/status - Admin only
router.patch('/:id/status', authorize('ADMIN'), saleController.updateStatus);

export default router;
