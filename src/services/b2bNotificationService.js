import prisma from '../config/database.js';

class B2bNotificationService {
    async getNotifications(userId) {
        return await prisma.storeNotification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
    }

    async markAsRead(notificationId, userId) {
        return await prisma.storeNotification.updateMany({
            where: { id: notificationId, userId },
            data: { isRead: true }
        });
    }

    async markAllAsRead(userId) {
        return await prisma.storeNotification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });
    }
}

export default new B2bNotificationService();
