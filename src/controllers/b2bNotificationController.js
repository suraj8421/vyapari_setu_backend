import b2bNotificationService from '../services/b2bNotificationService.js';
import { success } from '../utils/response.js';

class B2bNotificationController {
    async getNotifications(req, res, next) {
        try {
            const userId = req.user.id;
            const notifications = await b2bNotificationService.getNotifications(userId);
            return success(res, notifications, 'Notifications fetched');
        } catch (err) {
            next(err);
        }
    }

    async markAsRead(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            await b2bNotificationService.markAsRead(id, userId);
            return success(res, null, 'Marked as read');
        } catch (err) {
            next(err);
        }
    }

    async markAllAsRead(req, res, next) {
        try {
            const userId = req.user.id;
            await b2bNotificationService.markAllAsRead(userId);
            return success(res, null, 'All marked as read');
        } catch (err) {
            next(err);
        }
    }
}

export default new B2bNotificationController();
