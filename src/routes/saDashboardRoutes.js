import express from 'express';
import saDashboardController from '../controllers/saDashboardController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All Super Admin dashboard routes are restricted to SUPERADMIN role
router.use(authenticate, authorize('SUPERADMIN'));

// GET /api/sa-dashboard/stats
router.get('/stats', saDashboardController.getStats);

// GET /api/sa-dashboard/growth
router.get('/growth', saDashboardController.getSubscriptionGrowth);

export default router;
