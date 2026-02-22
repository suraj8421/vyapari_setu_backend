// ============================================
// Product Controller
// ============================================

import productService from '../services/productService.js';
import { success, paginated } from '../utils/response.js';

const productController = {
    async create(req, res, next) {
        try {
            const product = await productService.create(req.validatedBody);
            return success(res, product, 'Product created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { products, pagination } = await productService.getAll(req.query, storeId);
            return paginated(res, products, pagination, 'Products fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const product = await productService.getById(req.params.id);
            return success(res, product, 'Product fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const product = await productService.update(req.params.id, req.validatedBody);
            return success(res, product, 'Product updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await productService.delete(req.params.id);
            return success(res, null, 'Product deactivated');
        } catch (err) {
            next(err);
        }
    },

    async getCategories(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const categories = await productService.getCategories(storeId);
            return success(res, categories, 'Categories fetched');
        } catch (err) {
            next(err);
        }
    },

    async getLowStock(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const items = await productService.getLowStock(storeId);
            return success(res, items, 'Low stock items fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default productController;
