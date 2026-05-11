// ============================================
// Customer Portal Controller
// ============================================

import customerPortalService from '../services/customerPortalService.js';
import { success } from '../utils/response.js';

const customerPortalController = {

    async register(req, res, next) {
        try {
            const result = await customerPortalService.register(req.validatedBody);
            return success(res, result, 'Customer account created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async login(req, res, next) {
        try {
            const { email, password } = req.validatedBody;
            const result = await customerPortalService.login(email, password);
            return success(res, result, 'Login successful');
        } catch (err) {
            next(err);
        }
    },

    async refreshToken(req, res, next) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return next({ statusCode: 400, message: 'Refresh token required' });
            const tokens = await customerPortalService.refreshToken(refreshToken);
            return success(res, tokens, 'Token refreshed');
        } catch (err) {
            next(err);
        }
    },

    async logout(req, res, next) {
        try {
            await customerPortalService.logout(req.customerAccount.id);
            return success(res, null, 'Logged out successfully');
        } catch (err) {
            next(err);
        }
    },

    async getProfile(req, res, next) {
        try {
            const profile = await customerPortalService.getProfile(req.customerAccount.id);
            return success(res, profile, 'Profile fetched');
        } catch (err) {
            next(err);
        }
    },

    async getNotifications(req, res, next) {
        try {
            const notifications = await customerPortalService.getNotifications(req.customerAccount.id, req.query);
            return success(res, notifications, 'Notifications fetched');
        } catch (err) {
            next(err);
        }
    },

    async acceptNotification(req, res, next) {
        try {
            const result = await customerPortalService.acceptNotification(
                req.params.id,
                req.customerAccount.id
            );
            return success(res, result, 'Transaction accepted');
        } catch (err) {
            next(err);
        }
    },

    async rejectNotification(req, res, next) {
        try {
            const { reason } = req.body;
            const result = await customerPortalService.rejectNotification(
                req.params.id,
                req.customerAccount.id,
                reason
            );
            return success(res, result, 'Transaction rejected');
        } catch (err) {
            next(err);
        }
    },

    async getPurchaseHistory(req, res, next) {
        try {
            const result = await customerPortalService.getPurchaseHistory(req.customerAccount.id, req.query);
            return success(res, result, 'Purchase history fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default customerPortalController;
