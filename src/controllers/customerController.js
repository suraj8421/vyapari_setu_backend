// ============================================
// Customer Controller (Khata)
// ============================================

import customerService from '../services/customerService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const customerController = {
    async create(req, res, next) {
        try {
            // Enforce store isolation
            req.validatedBody.storeId = req.user.role === 'SUPERADMIN' 
                ? (req.validatedBody.storeId || req.user.storeId) 
                : req.user.storeId;

            const customer = await customerService.create(req.validatedBody);
            return success(res, customer, 'Customer created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { customers, pagination } = await customerService.getAll(req.query, storeId);
            return paginated(res, customers, pagination, 'Customers fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const customer = await customerService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && customer.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, customer, 'Customer fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const customer = await customerService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && customer.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            if (req.user.role !== 'SUPERADMIN') {
                delete req.validatedBody.storeId;
            }
            const updated = await customerService.update(req.params.id, req.validatedBody);
            return success(res, updated, 'Customer updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            const customer = await customerService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && customer.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            await customerService.delete(req.params.id);
            return success(res, null, 'Customer deactivated');
        } catch (err) {
            next(err);
        }
    },

    async getLedger(req, res, next) {
        try {
            if (req.params.id !== 'all') {
                const customer = await customerService.getById(req.params.id);
                if (req.user.role !== 'SUPERADMIN' && customer.storeId !== req.user.storeId) {
                    throw new AppError('Access denied. Insufficient permissions.', 403);
                }
            }
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { entries, pagination } = await customerService.getLedger(req.params.id, req.query, storeId);
            return paginated(res, entries, pagination, 'Ledger entries fetched');
        } catch (err) {
            next(err);
        }
    },

    async recordPayment(req, res, next) {
        try {
            const customer = await customerService.getById(req.validatedBody.customerId);
            if (req.user.role !== 'SUPERADMIN' && customer.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            const entry = await customerService.recordPayment(req.validatedBody, req.user.id);
            return success(res, entry, 'Payment recorded', 201);
        } catch (err) {
            next(err);
        }
    },

    async getOutstandingCredits(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const customers = await customerService.getOutstandingCredits(storeId);
            return success(res, customers, 'Outstanding credits fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default customerController;
