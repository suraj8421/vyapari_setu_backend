// ============================================
// Sale Controller
// ============================================

import saleService from '../services/saleService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const saleController = {
    async create(req, res, next) {
        try {
            // Enforce store isolation
            req.validatedBody.storeId = req.user.role === 'SUPERADMIN' 
                ? (req.validatedBody.storeId || req.user.storeId) 
                : req.user.storeId;

            const sale = await saleService.create(req.validatedBody, req.user.id);
            return success(res, sale, 'Sale created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { sales, pagination } = await saleService.getAll(req.query, storeId);
            return paginated(res, sales, pagination, 'Sales fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const sale = await saleService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && sale.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, sale, 'Sale fetched');
        } catch (err) {
            next(err);
        }
    },

    /**
     * FIX: Update sale status — previously there was no way to mark a sale
     * as RETURNED or PARTIAL_RETURN despite those statuses existing in the schema.
     * Staff submit for approval; admins apply directly.
     */
    async updateStatus(req, res, next) {
        try {
            const sale = await saleService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && sale.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            const updated = await saleService.updateStatus(req.params.id, req.body, req.user);
            return success(res, updated, 'Sale status updated');
        } catch (err) {
            next(err);
        }
    },
};

export default saleController;
