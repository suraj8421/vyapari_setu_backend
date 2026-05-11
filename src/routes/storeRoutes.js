// ============================================
// Store Routes
// ============================================

import express from 'express';
import storeController from '../controllers/storeController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createStoreSchema, updateStoreSchema } from '../validators/schemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// POST /api/stores - Admin only
router.post('/', authorize('ADMIN'), validateBody(createStoreSchema), storeController.create);

// GET /api/stores
router.get('/', storeController.getAll);

// GET /api/stores/:id
router.get('/:id', storeController.getById);

// PUT /api/stores/:id - Admin only
router.put('/:id', authorize('ADMIN'), validateBody(updateStoreSchema), storeController.update);

// DELETE /api/stores/:id - Admin only
router.delete('/:id', authorize('ADMIN'), storeController.delete);

export default router;
