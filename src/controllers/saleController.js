// ============================================
// Sale Controller
// ============================================

import saleService from '../services/saleService.js';
import { success, paginated } from '../utils/response.js';

const saleController = {
    async create(req, res, next) {
        try {
            const sale = await saleService.create(req.validatedBody, req.user.id);
            return success(res, sale, 'Sale created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { sales, pagination } = await saleService.getAll(req.query, storeId);
            return paginated(res, sales, pagination, 'Sales fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const sale = await saleService.getById(req.params.id);
            return success(res, sale, 'Sale fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default saleController;
