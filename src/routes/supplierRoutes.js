// ============================================
// Supplier Routes
// ============================================

import express from 'express';
import supplierController from '../controllers/supplierController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSupplierSchema, updateSupplierSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// POST /api/suppliers - Admin only
router.post('/', authorize('ADMIN'), validateBody(createSupplierSchema), supplierController.create);

// GET /api/suppliers
router.get('/', supplierController.getAll);

// GET /api/suppliers/:id
router.get('/:id', supplierController.getById);

// PUT /api/suppliers/:id - Admin only
router.put('/:id', authorize('ADMIN'), validateBody(updateSupplierSchema), supplierController.update);

// DELETE /api/suppliers/:id - Admin only
router.delete('/:id', authorize('ADMIN'), supplierController.delete);

export default router;
