// ============================================
// Purchase Controller
// ============================================

import purchaseService from '../services/purchaseService.js';
import { success, paginated } from '../utils/response.js';

const purchaseController = {
    async create(req, res, next) {
        try {
            const purchase = await purchaseService.create(req.validatedBody, req.user.id);
            return success(res, purchase, 'Purchase created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { purchases, pagination } = await purchaseService.getAll(req.query, storeId);
            return paginated(res, purchases, pagination, 'Purchases fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const purchase = await purchaseService.getById(req.params.id);
            return success(res, purchase, 'Purchase fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default purchaseController;
