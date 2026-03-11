// ============================================
// Expense Routes
// ============================================
// FIX: This entire route file is new. Expenses could only be created via
// the Unified Entry console; there was no way to list, filter, or view them.

import express from 'express';
import expenseController from '../controllers/expenseController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/expenses/categories - Get distinct categories (for filter UI)
router.get('/categories', expenseController.getCategories);

// GET /api/expenses - List all expenses (filterable by date, category, store)
router.get('/', expenseController.getAll);

// GET /api/expenses/:id - Get a single expense
router.get('/:id', expenseController.getById);

export default router;
