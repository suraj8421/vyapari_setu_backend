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

export default router;
