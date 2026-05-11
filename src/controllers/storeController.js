// ============================================
// Store Controller
// ============================================

import storeService from '../services/storeService.js';
import { success, paginated } from '../utils/response.js';

const storeController = {
    async create(req, res, next) {
        try {
            const store = await storeService.create(req.validatedBody);
            return success(res, store, 'Store created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const { stores, pagination } = await storeService.getAll(req.query);
            return paginated(res, stores, pagination, 'Stores fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const store = await storeService.getById(req.params.id);
            return success(res, store, 'Store fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const store = await storeService.update(req.params.id, req.validatedBody);
            return success(res, store, 'Store updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await storeService.delete(req.params.id);
            return success(res, null, 'Store deactivated');
        } catch (err) {
            next(err);
        }
    },
};

export default storeController;
