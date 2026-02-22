// ============================================
// User Management Controller
// ============================================

import userService from '../services/userService.js';
import authService from '../services/authService.js';
import { success, paginated } from '../utils/response.js';

const userController = {
    async create(req, res, next) {
        try {
            // Use auth service to register (includes password hashing)
            const result = await authService.register(req.validatedBody);
            return success(res, result.user, 'User created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const { users, pagination } = await userService.getAll(req.query);
            return paginated(res, users, pagination, 'Users fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const user = await userService.getById(req.params.id);
            return success(res, user, 'User fetched');
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const user = await userService.update(req.params.id, req.validatedBody);
            return success(res, user, 'User updated');
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await userService.delete(req.params.id);
            return success(res, null, 'User deactivated');
        } catch (err) {
            next(err);
        }
    },
};

export default userController;
