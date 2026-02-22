// ============================================
// Auth Controller
// ============================================

import authService from '../services/authService.js';
import { success, error } from '../utils/response.js';

const authController = {
    async register(req, res, next) {
        try {
            const result = await authService.register(req.validatedBody);
            return success(res, result, 'Registration successful', 201);
        } catch (err) {
            next(err);
        }
    },

    async login(req, res, next) {
        try {
            const { email, password } = req.validatedBody;
            const result = await authService.login(email, password);
            return success(res, result, 'Login successful');
        } catch (err) {
            next(err);
        }
    },

    async refreshToken(req, res, next) {
        try {
            const { refreshToken } = req.validatedBody;
            const tokens = await authService.refreshToken(refreshToken);
            return success(res, tokens, 'Token refreshed');
        } catch (err) {
            next(err);
        }
    },

    async logout(req, res, next) {
        try {
            await authService.logout(req.user.id);
            return success(res, null, 'Logged out successfully');
        } catch (err) {
            next(err);
        }
    },

    async getProfile(req, res, next) {
        try {
            const user = await authService.getProfile(req.user.id);
            return success(res, user, 'Profile fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default authController;
