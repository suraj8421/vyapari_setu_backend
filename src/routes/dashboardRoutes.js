// ============================================
// Dashboard Routes
// ============================================

import express from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/dashboard/overview
router.get('/overview', dashboardController.getOverview);

// GET /api/dashboard/sales-chart
router.get('/sales-chart', dashboardController.getSalesChart);

// GET /api/dashboard/top-products
router.get('/top-products', dashboardController.getTopProducts);

// GET /api/dashboard/profit-loss
router.get('/profit-loss', dashboardController.getProfitLoss);

// GET /api/dashboard/staff-performance
router.get('/staff-performance', dashboardController.getStaffPerformance);

export default router;
