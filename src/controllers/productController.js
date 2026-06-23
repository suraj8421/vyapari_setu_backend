// ============================================
// Product Controller
// ============================================

import productService from '../services/productService.js';
import matchService from '../services/matchService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const productController = {
    async match(req, res, next) {
        try {
            const { items } = req.body;
            const storeId = req.user.storeId;
            const result = await matchService.matchItems(items, storeId);
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

            const product = await productService.create(req.validatedBody);
            return success(res, product, 'Product created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { products, pagination } = await productService.getAll(req.query, storeId);
            return paginated(res, products, pagination, 'Products fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && product.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, product, 'Product fetched');
        } catch (err) {
            next(err);
        }
    },

    async getMovementHistory(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && product.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            const history = await productService.getMovementHistory(req.params.id);
            return success(res, history, 'Product movement history fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && product.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            if (req.user.role !== 'SUPERADMIN') {
                delete req.validatedBody.storeId;
            }
            const updated = await productService.update(req.params.id, req.validatedBody);
            return success(res, updated, 'Product updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && product.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            await productService.delete(req.params.id);
            return success(res, null, 'Product deactivated');
        } catch (err) {
            next(err);
        }
    },

    async getCategories(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const categories = await productService.getCategories(storeId);
            return success(res, categories, 'Categories fetched');
        } catch (err) {
            next(err);
        }
    },

    async adjustStock(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && product.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            const storeId = req.user.storeId;
            const updated = await productService.adjustStock(req.params.id, { ...req.body, storeId });
            return success(res, updated, 'Inventory adjusted successfully');
        } catch (err) {
            next(err);
        }
    },

    async getLowStock(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const items = await productService.getLowStock(storeId);
            return success(res, items, 'Low stock items fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default productController;
