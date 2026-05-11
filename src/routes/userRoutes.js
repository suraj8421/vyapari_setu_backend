// ============================================
// User Management Routes
// ============================================

import express from 'express';
import userController from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, updateUserSchema } from '../validators/schemas.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN')); // All user management routes are admin-only

// POST /api/users
router.post('/', validateBody(registerSchema), userController.create);

// GET /api/users
router.get('/', userController.getAll);

// GET /api/users/:id
router.get('/:id', userController.getById);

// PUT /api/users/:id
router.put('/:id', validateBody(updateUserSchema), userController.update);

// DELETE /api/users/:id
router.delete('/:id', userController.delete);

export default router;
