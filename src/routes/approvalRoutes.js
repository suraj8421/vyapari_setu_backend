import express from 'express';
import { authenticate, storeScope } from '../middleware/auth.js';
import approvalNotificationService from '../services/approvalNotificationService.js';
import b2bInvoiceService from '../services/b2bInvoiceService.js';
import b2bConnectionService from '../services/b2bConnectionService.js';
import prisma from '../config/database.js';

const router = express.Router();

// All routes require auth and store scope
router.use(authenticate, storeScope);

// ─── GET all approval notifications for the user's store ─────────
router.get('/', async (req, res, next) => {
    try {
        const { status, referenceType, type } = req.query;
        const types = type ? type.split(',') : undefined;
        const notifications = await approvalNotificationService.getByStore(
            req.user.storeId,
            { status, referenceType, type: types }
        );
        res.json({ success: true, data: notifications });
    } catch (err) {
        next(err);
    }
});

// ─── GET unread count ─────────────────────────────────────────────
router.get('/unread-count', async (req, res, next) => {
    try {
        const count = await approvalNotificationService.getUnreadCount(req.user.storeId);
        res.json({ success: true, data: { count } });
    } catch (err) {
        next(err);
    }
});

// ─── Mark single as read ──────────────────────────────────────────
router.patch('/:id/read', async (req, res, next) => {
    try {
        await approvalNotificationService.markRead(req.params.id, req.user.storeId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Mark all as read ─────────────────────────────────────────────
router.post('/mark-all-read', async (req, res, next) => {
    try {
        await approvalNotificationService.markAllRead(req.user.storeId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Soft Locking ─────────────────────────────────────────────────
router.post('/:id/lock', async (req, res, next) => {
    try {
        const io = req.app.locals.io;
        
        // Prevent re-locking if someone else already locked it
        const existingLock = approvalNotificationService.getLock(req.params.id);
        if (existingLock && existingLock.userId !== req.user.id) {
            return res.status(409).json({ success: false, message: 'Already locked by another user' });
        }

        approvalNotificationService.lock(req.params.id, req.user.id, io);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/unlock', async (req, res, next) => {
    try {
        const io = req.app.locals.io;
        approvalNotificationService.unlock(req.params.id, io);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Confirm a B2B invoice from Approvals page ───────────────────
// FIX: Use direct getById() to avoid N+1; pass req.user.id to service.
router.post('/:id/confirm-invoice', async (req, res, next) => {
    try {
        const io = req.app.locals.io;
        const notif = await approvalNotificationService.getById(req.params.id, req.user.storeId);

        const result = await b2bInvoiceService.confirmInvoice(
            notif.referenceId,
            req.user.storeId,
            req.user.id,    // FIX: was missing — needed for ledger recordedById
            io
        );

        await approvalNotificationService.updateStatus(req.params.id, req.user.storeId, 'APPROVED');

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ─── Reject a B2B invoice from Approvals page ────────────────────
// FIX: Use direct getById() instead of scanning full list
router.post('/:id/reject-invoice', async (req, res, next) => {
    try {
        const { reason } = req.body;
        const io = req.app.locals.io;
        const notif = await approvalNotificationService.getById(req.params.id, req.user.storeId);

        const result = await b2bInvoiceService.rejectInvoice(
            notif.referenceId,
            req.user.storeId,
            reason,
            io
        );

        await approvalNotificationService.updateStatus(req.params.id, req.user.storeId, 'REJECTED');

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ─── Accept a store connection from Approvals page ───────────────
// FIX: Use direct getById() instead of scanning full list
router.post('/:id/accept-connection', async (req, res, next) => {
    try {
        const io = req.app.locals.io;
        const notif = await approvalNotificationService.getById(req.params.id, req.user.storeId);

        const result = await b2bConnectionService.acceptConnection(
            notif.referenceId,
            req.user.storeId
        );

        await approvalNotificationService.updateStatus(req.params.id, req.user.storeId, 'APPROVED');

        // Notify both parties via socket
        if (io) {
            io.to(`store_${result.supplierStoreId}`).emit('connection_accepted', result);
            io.to(`store_${result.buyerStoreId}`).emit('connection_accepted', result);
        }

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ─── NEW: Reject a store connection from Approvals page ──────────
// Properly marks the StoreConnection as BLOCKED and the notification as REJECTED.
router.post('/:id/reject-connection', async (req, res, next) => {
    try {
        const { reason } = req.body;
        const notif = await approvalNotificationService.getById(req.params.id, req.user.storeId);

        // Block the connection in Prisma
        await prisma.storeConnection.update({
            where: { id: notif.referenceId },
            data: { status: 'BLOCKED' },
        });

        await approvalNotificationService.updateStatus(req.params.id, req.user.storeId, 'REJECTED');
        await approvalNotificationService.createHistory(notif.referenceId, notif.referenceType, 'REJECTED', req.user.id);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Bulk Action ──────────────────────────────────────────────────
router.post('/bulk-action', async (req, res, next) => {
    try {
        const { ids, action } = req.body;
        if (!ids || !ids.length || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid bulk action request' });
        }

        const io = req.app.locals.io;
        
        let successCount = 0;
        let errors = [];

        // Fetch all requested notifications ensuring store ownership
        const notifications = await prisma.approvalNotification.findMany({
            where: { id: { in: ids }, storeId: req.user.storeId, status: 'PENDING' }
        });

        for (const notif of notifications) {
            try {
                if (action === 'approve') {
                    if (notif.referenceType === 'invoice') {
                        await b2bInvoiceService.confirmInvoice(notif.referenceId, req.user.storeId, req.user.id, io);
                    } else if (notif.referenceType === 'connection') {
                        await b2bConnectionService.acceptConnection(notif.referenceId, req.user.storeId);
                    }
                    await approvalNotificationService.updateStatus(notif.id, req.user.storeId, 'APPROVED');
                    await approvalNotificationService.createHistory(notif.referenceId, notif.referenceType, 'CONFIRMED', req.user.id);
                } else if (action === 'reject') {
                    if (notif.referenceType === 'invoice') {
                        await b2bInvoiceService.rejectInvoice(notif.referenceId, req.user.storeId, "Bulk rejected", io);
                    } else if (notif.referenceType === 'connection') {
                        await prisma.storeConnection.update({
                            where: { id: notif.referenceId },
                            data: { status: 'BLOCKED' }
                        });
                    }
                    await approvalNotificationService.updateStatus(notif.id, req.user.storeId, 'REJECTED');
                    await approvalNotificationService.createHistory(notif.referenceId, notif.referenceType, 'REJECTED', req.user.id);
                }
                successCount++;
            } catch (err) {
                errors.push({ id: notif.id, error: err.message });
            }
        }

        // Emit an event that bulk actions completed successfully
        if (io) {
            io.to(`store_${req.user.storeId}`).emit('bulk_action_completed');
        }

        res.json({ success: true, count: successCount, errors });
    } catch (err) {
        next(err);
    }
});

export default router;
