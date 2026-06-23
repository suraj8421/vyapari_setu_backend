// ============================================
// Supplier Controller
// ============================================

import supplierService from '../services/supplierService.js';
import matchService from '../services/matchService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const supplierController = {
    async match(req, res, next) {
        try {
            const { name, gstin } = req.body;
            const storeId = req.user.storeId;
            const result = await matchService.matchSupplier(name, gstin, storeId);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    },

    async create(req, res, next) {
        try {
            // Enforce store isolation
            req.validatedBody.storeId = req.user.role === 'SUPERADMIN' 
                ? (req.validatedBody.storeId || req.user.storeId) 
                : req.user.storeId;

            const supplier = await supplierService.create(req.validatedBody);
            return success(res, supplier, 'Supplier created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { suppliers, pagination } = await supplierService.getAll(req.query, storeId);
            return paginated(res, suppliers, pagination, 'Suppliers fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const supplier = await supplierService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && supplier.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, supplier, 'Supplier fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const supplier = await supplierService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && supplier.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            if (req.user.role !== 'SUPERADMIN') {
                delete req.validatedBody.storeId;
            }
            const updated = await supplierService.update(req.params.id, req.validatedBody);
            return success(res, updated, 'Supplier updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            const supplier = await supplierService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && supplier.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            await supplierService.delete(req.params.id);
            return success(res, null, 'Supplier deactivated');
        } catch (err) {
            next(err);
        }
    },
};

export default supplierController;
