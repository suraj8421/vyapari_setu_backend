// ============================================
// Purchase Routes
// ============================================

import express from 'express';
import purchaseController from '../controllers/purchaseController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createPurchaseSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// POST /api/purchases - Admin only
router.post('/', authorize('ADMIN'), validateBody(createPurchaseSchema), purchaseController.create);

// GET /api/purchases
router.get('/', purchaseController.getAll);

// GET /api/purchases/:id
router.get('/:id', purchaseController.getById);

// PATCH /api/purchases/:id/status - Admin only
// FIX: This route was missing; the PurchaseStatus enum had PENDING, RECEIVED,
// PARTIAL, CANCELLED defined in the schema but there was no way to use them.
router.patch('/:id/status', authorize('ADMIN'), purchaseController.updateStatus);

export default router;
