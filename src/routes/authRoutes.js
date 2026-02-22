// ============================================
// Auth Routes
// ============================================

import express from 'express';
import authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema, refreshTokenSchema } from '../validators/schemas.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', validateBody(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), authController.login);

// POST /api/auth/refresh
router.post('/refresh', validateBody(refreshTokenSchema), authController.refreshToken);

// POST /api/auth/logout (requires auth)
router.post('/logout', authenticate, authController.logout);

// GET /api/auth/profile (requires auth)
router.get('/profile', authenticate, authController.getProfile);

export default router;
