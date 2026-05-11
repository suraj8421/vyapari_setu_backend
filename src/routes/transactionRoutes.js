// ============================================
// Transaction Routes
// ============================================

import express from 'express';
import transactionController from '../controllers/transactionController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All unified transaction routes require authentication
router.use(authenticate);

/**
 * @route POST /api/transactions
 * @desc Record a unified entry (Sale, Purchase, Expense, Payment, MISC)
 */
router.post('/', transactionController.create);

/**
 * @route GET /api/transactions/pending
 * @desc Admin — Get all pending edit approval requests
 * FIX: This endpoint was completely missing. Admins had no way to
 * discover and action staff edit requests stuck in PENDING status.
 * Placed BEFORE /:type/:id to avoid route conflict with that pattern.
 */
router.get('/pending', authorize('ADMIN'), transactionController.getPendingApprovals);

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
 * @route POST /api/transactions/logs/:logId/approve
 * @desc Admin approve a pending edit
 * FIX: Previously this was POST /approve/:logId which could conflict
 * with POST /:type/:id route patterns. Moved to /logs/:logId/approve
 * to make the route structure clear and avoid ambiguity.
 */
router.post('/logs/:logId/approve', authorize('ADMIN'), transactionController.approve);

/**
 * @route POST /api/transactions/logs/:logId/reject
 * @desc Admin reject a pending edit
 * FIX: This entire route was missing — admins could only approve,
 * not reject pending edit requests.
 */
router.post('/logs/:logId/reject', authorize('ADMIN'), transactionController.reject);

export default router;
