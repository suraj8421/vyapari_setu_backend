import prisma from '../config/database.js';
import { AppError } from '../utils/AppError.js';

class ApprovalNotificationService {
    constructor() {
        // Soft Locking: referenceId -> { userId, timestamp }
        this.locks = new Map();
        
        // Auto-cleanup locks older than 2 minutes every minute
        setInterval(() => {
            const now = Date.now();
            for (const [refId, lock] of this.locks.entries()) {
                if (now - lock.timestamp > 2 * 60 * 1000) {
                    this.locks.delete(refId);
                }
            }
        }, 60000);
    }
    
    /**
     * Create a new ApprovalNotification for a store.
     * Called by b2bInvoiceService, b2bConnectionService, etc.
     * Optionally accepts a Socket.IO `io` instance to emit real-time events.
     */
    async create({ storeId, type, title, message, referenceId, referenceType, actionData, userId }, io) {
        let priority = 'LOW';
        if (['B2B_INVOICE_REQUEST', 'PAYMENT'].includes(type)) priority = 'HIGH';
        else if (type === 'STORE_CONNECTION_REQUEST') priority = 'MEDIUM';

        const notif = await prisma.approvalNotification.create({
            data: {
                storeId,
                type,
                title,
                message,
                referenceId,
                referenceType,
                priority,
                actionData: actionData ? JSON.stringify(actionData) : null,
                status: 'PENDING',
            },
        });

        // Real-time push so the header bell badge updates immediately
        if (io) {
            io.to(`store_${storeId}`).emit('notification_created', {
                id: notif.id,
                type: notif.type,
                title: notif.title,
                message: notif.message,
            });
        }

        if (userId) {
            await this.createHistory(referenceId, referenceType, 'CREATED', userId);
        }

        return notif;
    }

    /**
     * Log history event
     */
    async createHistory(referenceId, referenceType, action, userId) {
        if (!userId) return; // Silent skip if no user provided (system events)
        try {
            await prisma.approvalHistory.create({
                data: {
                    referenceId,
                    referenceType,
                    action,
                    performedBy: userId
                }
            });
        } catch (error) {
            console.error('Failed to log approval history', error);
        }
    }

    /**
     * Lock an approval
     */
    lock(referenceId, userId, io) {
        this.locks.set(referenceId, { userId, timestamp: Date.now() });
        if (io) {
            io.emit('approval_locked', { referenceId, userId });
        }
        return true;
    }

    /**
     * Unlock an approval
     */
    unlock(referenceId, io) {
        this.locks.delete(referenceId);
        if (io) {
            io.emit('approval_unlocked', { referenceId });
        }
        return true;
    }

    /**
     * Get lock status
     */
    getLock(referenceId) {
        const lock = this.locks.get(referenceId);
        if (lock && Date.now() - lock.timestamp > 2 * 60 * 1000) {
            this.locks.delete(referenceId);
            return null;
        }
        return lock;
    }

    /**
     * Direct lookup by id — avoids the N+1 full-table scan pattern in routes.
     */
    async getById(id, storeId) {
        const notif = await prisma.approvalNotification.findUnique({ where: { id } });
        if (!notif) throw new AppError('Notification not found', 404);
        if (notif.storeId !== storeId) throw new AppError('Unauthorized', 403);
        return notif;
    }

    /**
     * Get all notifications for a store, newest first.
     * Supports filtering by status, referenceType, and type.
     */
    async getByStore(storeId, { status, referenceType, type } = {}) {
        const where = { storeId };
        if (status) where.status = status;
        if (referenceType) where.referenceType = referenceType;
        if (type) {
            if (Array.isArray(type)) {
                where.type = { in: type };
            } else {
                where.type = type;
            }
        }
        const data = await prisma.approvalNotification.findMany({
            where,
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 100,
        });

        // Automatically unlock any items not fetched or grouped
        return data;
    }

    /**
     * Group notifications intelligently
     */
    groupNotifications(notifications) {
        const grouped = {};
        const standalone = [];

        for (const notif of notifications) {
            // Only group unread pending generic items that aren't high priority
            if (notif.status !== 'PENDING' || notif.isRead || notif.priority === 'HIGH') {
                standalone.push(notif);
                continue;
            }

            const key = `${notif.type}_${notif.referenceType}`;
            if (!grouped[key]) {
                grouped[key] = {
                    ...notif,
                    originalIds: [notif.id],
                    count: 1,
                    title: `Multiple ${notif.type.replace(/_/g, ' ').toLowerCase()}s`,
                    message: `1 ${notif.type.replace(/_/g, ' ').toLowerCase()} pending`,
                    isGroup: true
                };
            } else {
                grouped[key].originalIds.push(notif.id);
                grouped[key].count++;
                grouped[key].message = `${grouped[key].count} ${notif.type.replace(/_/g, ' ').toLowerCase()}s pending`;
            }
        }

        // Only keep groups > 1, stringify back others
        for (const key in grouped) {
            if (grouped[key].count === 1) {
                standalone.push(notifications.find(n => n.id === grouped[key].originalIds[0]));
            } else {
                standalone.push(grouped[key]);
            }
        }

        return standalone.sort((a, b) => {
            const p = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            return (p[b.priority || 'LOW'] - p[a.priority || 'LOW']) || (new Date(b.createdAt) - new Date(a.createdAt));
        });
    }

    /**
     * Get unread count for a store (only PENDING + unread items shown in badge).
     */
    async getUnreadCount(storeId) {
        return await prisma.approvalNotification.count({
            where: { storeId, isRead: false, status: 'PENDING' },
        });
    }

    /**
     * Mark a single notification as read.
     */
    async markRead(id, storeId) {
        const notif = await prisma.approvalNotification.findUnique({ where: { id } });
        if (!notif) throw new AppError('Notification not found', 404);
        if (notif.storeId !== storeId) throw new AppError('Unauthorized', 403);
        return await prisma.approvalNotification.update({
            where: { id },
            data: { isRead: true },
        });
    }

    /**
     * Mark all notifications as read for a store.
     */
    async markAllRead(storeId) {
        await prisma.approvalNotification.updateMany({
            where: { storeId, isRead: false },
            data: { isRead: true },
        });
    }

    /**
     * Update status of a notification (APPROVED or REJECTED).
     */
    async updateStatus(id, storeId, status) {
        const notif = await prisma.approvalNotification.findUnique({ where: { id } });
        if (!notif) throw new AppError('Notification not found', 404);
        if (notif.storeId !== storeId) throw new AppError('Unauthorized', 403);
        return await prisma.approvalNotification.update({
            where: { id },
            data: { status, isRead: true },
        });
    }
}

export default new ApprovalNotificationService();
