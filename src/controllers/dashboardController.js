// ============================================
// Dashboard Controller
// ============================================

import dashboardService from '../services/dashboardService.js';
import { success, error } from '../utils/response.js';

const dashboardController = {
    async getOverview(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const overview = await dashboardService.getOverview(storeId);
            return success(res, overview, 'Dashboard overview fetched');
        } catch (err) {
            next(err);
        }
    },

    async getSalesChart(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const days = parseInt(req.query.days, 10) || 30;
            const data = await dashboardService.getSalesChart(days, storeId);
            return success(res, data, 'Sales chart data fetched');
        } catch (err) {
            next(err);
        }
    },

    async getTopProducts(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const limit = parseInt(req.query.limit, 10) || 10;
            const data = await dashboardService.getTopProducts(limit, storeId);
            return success(res, data, 'Top products fetched');
        } catch (err) {
            next(err);
        }
    },

    async getProfitLoss(req, res, next) {
        try {
            const { startDate, endDate } = req.query;
            if (!startDate || !endDate) {
                return error(res, 'startDate and endDate are required', 400);
            }
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const data = await dashboardService.getProfitLoss(startDate, endDate, storeId);
            return success(res, data, 'Profit/Loss report fetched');
        } catch (err) {
            next(err);
        }
    },

    async getStaffPerformance(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const data = await dashboardService.getStaffPerformance(storeId);
            return success(res, data, 'Staff performance fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default dashboardController;
