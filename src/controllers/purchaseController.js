// ============================================
// Purchase Controller
// ============================================

import purchaseService from '../services/purchaseService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const purchaseController = {
    async create(req, res, next) {
        try {
            // Enforce store isolation
            req.validatedBody.storeId = req.user.role === 'SUPERADMIN' 
                ? (req.validatedBody.storeId || req.user.storeId) 
                : req.user.storeId;

            const purchase = await purchaseService.create(req.validatedBody, req.user.id);
            return success(res, purchase, 'Purchase created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { purchases, pagination } = await purchaseService.getAll(req.query, storeId);
            return paginated(res, purchases, pagination, 'Purchases fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const purchase = await purchaseService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && purchase.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, purchase, 'Purchase fetched');
        } catch (err) {
            next(err);
        }
    },

    async updateStatus(req, res, next) {
        try {
            const purchase = await purchaseService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && purchase.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            const updated = await purchaseService.updateStatus(req.params.id, req.body);
            return success(res, updated, 'Purchase status updated');
        } catch (err) {
            next(err);
        }
    },
};

export default purchaseController;
