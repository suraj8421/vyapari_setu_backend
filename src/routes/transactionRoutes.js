// ============================================
// Transaction Routes
// ============================================

import express from 'express';
import transactionController from '../controllers/transactionController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All unified transaction routes require authentication
router.use(authenticate);

/**
 * @route POST /api/transactions
 * @desc Record a unified entry (Sale, Purchase, Expense, etc.)
 */
router.post('/', transactionController.create);

/**
 * @route PUT /api/transactions/:type/:id
 * @desc Request update (Staff) or Direct Update (Admin)
 */
router.put('/:type/:id', transactionController.update);

/**
 * @route GET /api/transactions/:type/:id/history
 * @desc Get permanent edit history / audit logs for an entry
 */
router.get('/:type/:id/history', transactionController.getHistory);

/**
 * @route POST /api/transactions/approve/:logId
 * @desc Admin approve a pending edit
 */
router.post('/approve/:logId', transactionController.approve);

export default router;
