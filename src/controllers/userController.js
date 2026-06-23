// ============================================
// User Management Controller
// ============================================

import userService from '../services/userService.js';
import authService from '../services/authService.js';
import { success, paginated } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

const userController = {
    async create(req, res, next) {
        try {
            // Enforce store isolation
            req.validatedBody.storeId = req.user.role === 'SUPERADMIN' 
                ? (req.validatedBody.storeId || req.user.storeId) 
                : req.user.storeId;

            // Use auth service to register (includes password hashing)
            const result = await authService.register(req.validatedBody);
            return success(res, result.user, 'User created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'SUPERADMIN' ? (req.query.storeId || null) : req.user.storeId;
            const { users, pagination } = await userService.getAll(req.query, storeId);
            return paginated(res, users, pagination, 'Users fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const user = await userService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && user.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            return success(res, user, 'User fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const user = await userService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && user.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            if (req.user.role !== 'SUPERADMIN') {
                delete req.validatedBody.storeId;
            }
            const updated = await userService.update(req.params.id, req.validatedBody);
            return success(res, updated, 'User updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            const user = await userService.getById(req.params.id);
            if (req.user.role !== 'SUPERADMIN' && user.storeId !== req.user.storeId) {
                throw new AppError('Access denied. Insufficient permissions.', 403);
            }
            await userService.delete(req.params.id);
            return success(res, null, 'User deactivated');
        } catch (err) {
            next(err);
        }
    },
};

export default userController;
