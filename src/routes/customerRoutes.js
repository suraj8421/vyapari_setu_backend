// ============================================
// Customer Routes (Khata)
// ============================================

import express from 'express';
import customerController from '../controllers/customerController.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createCustomerSchema, updateCustomerSchema, createLedgerEntrySchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);

// GET /api/customers/outstanding
router.get('/outstanding', customerController.getOutstandingCredits);

// POST /api/customers/payment
router.post('/payment', validateBody(createLedgerEntrySchema), customerController.recordPayment);

// POST /api/customers
router.post('/', validateBody(createCustomerSchema), customerController.create);

// GET /api/customers
router.get('/', customerController.getAll);

// GET /api/customers/:id
router.get('/:id', customerController.getById);

// GET /api/customers/:id/ledger
router.get('/:id/ledger', customerController.getLedger);

// PUT /api/customers/:id
router.put('/:id', validateBody(updateCustomerSchema), customerController.update);

// DELETE /api/customers/:id
router.delete('/:id', customerController.delete);

export default router;
