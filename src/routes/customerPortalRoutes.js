// ============================================
// Customer Portal Routes
// ============================================

import express from 'express';
import customerPortalController from '../controllers/customerPortalController.js';
import { authenticateCustomer } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { customerPortalRegisterSchema, customerPortalLoginSchema } from '../validators/schemas.js';

const router = express.Router();

// ── Public ──────────────────────────────────
// POST /api/customer-portal/register
router.post('/register', validateBody(customerPortalRegisterSchema), customerPortalController.register);

// POST /api/customer-portal/login
router.post('/login', validateBody(customerPortalLoginSchema), customerPortalController.login);

// POST /api/customer-portal/refresh
router.post('/refresh', customerPortalController.refreshToken);

// ── Protected (requires customer JWT) ───────
// GET /api/customer-portal/profile
router.get('/profile', authenticateCustomer, customerPortalController.getProfile);

// POST /api/customer-portal/logout
router.post('/logout', authenticateCustomer, customerPortalController.logout);

// GET /api/customer-portal/notifications
router.get('/notifications', authenticateCustomer, customerPortalController.getNotifications);

// PUT /api/customer-portal/notifications/:id/accept
router.put('/notifications/:id/accept', authenticateCustomer, customerPortalController.acceptNotification);

// PUT /api/customer-portal/notifications/:id/reject
router.put('/notifications/:id/reject', authenticateCustomer, customerPortalController.rejectNotification);

// GET /api/customer-portal/purchases
router.get('/purchases', authenticateCustomer, customerPortalController.getPurchaseHistory);

export default router;
