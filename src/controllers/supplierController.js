// ============================================
// Supplier Controller
// ============================================

import supplierService from '../services/supplierService.js';
import { success, paginated } from '../utils/response.js';

const supplierController = {
    async create(req, res, next) {
        try {
            const supplier = await supplierService.create(req.validatedBody);
            return success(res, supplier, 'Supplier created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { suppliers, pagination } = await supplierService.getAll(req.query, storeId);
            return paginated(res, suppliers, pagination, 'Suppliers fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const supplier = await supplierService.getById(req.params.id);
            return success(res, supplier, 'Supplier fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const supplier = await supplierService.update(req.params.id, req.validatedBody);
            return success(res, supplier, 'Supplier updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await supplierService.delete(req.params.id);
            return success(res, null, 'Supplier deactivated');
        } catch (err) {
            next(err);
        }
    },
};

export default supplierController;
