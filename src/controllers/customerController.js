// ============================================
// Customer Controller (Khata)
// ============================================

import customerService from '../services/customerService.js';
import { success, paginated } from '../utils/response.js';

const customerController = {
    async create(req, res, next) {
        try {
            const customer = await customerService.create(req.validatedBody);
            return success(res, customer, 'Customer created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { customers, pagination } = await customerService.getAll(req.query, storeId);
            return paginated(res, customers, pagination, 'Customers fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const customer = await customerService.getById(req.params.id);
            return success(res, customer, 'Customer fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const customer = await customerService.update(req.params.id, req.validatedBody);
            return success(res, customer, 'Customer updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await customerService.delete(req.params.id);
            return success(res, null, 'Customer deactivated');
        } catch (err) {
            next(err);
        }
    },

    async getLedger(req, res, next) {
        try {
            const { entries, pagination } = await customerService.getLedger(req.params.id, req.query);
            return paginated(res, entries, pagination, 'Ledger entries fetched');
        } catch (err) {
            next(err);
        }
    },

    async recordPayment(req, res, next) {
        try {
            const entry = await customerService.recordPayment(req.validatedBody, req.user.id);
            return success(res, entry, 'Payment recorded', 201);
        } catch (err) {
            next(err);
        }
    },

    async getOutstandingCredits(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const customers = await customerService.getOutstandingCredits(storeId);
            return success(res, customers, 'Outstanding credits fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default customerController;
