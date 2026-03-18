import express from 'express';
import { authenticate } from '../middleware/auth.js';

import b2bConnectionController from '../controllers/b2bConnectionController.js';
import b2bInvoiceController from '../controllers/b2bInvoiceController.js';
import b2bMessageController from '../controllers/b2bMessageController.js';
import b2bNotificationController from '../controllers/b2bNotificationController.js';

const router = express.Router();

// All B2B routes require authentication
router.use(authenticate);

// ─── Network Connections ─────────────────
router.get('/network', b2bConnectionController.getConnections);
router.post('/network/request', b2bConnectionController.requestConnection);
router.post('/network/:connectionId/accept', b2bConnectionController.acceptConnection);
router.get('/network/search', b2bConnectionController.searchStores);

// ─── B2B Invoices ────────────────────────
router.get('/invoices', b2bInvoiceController.getStoreInvoices);
router.post('/invoices/create', b2bInvoiceController.createInvoice);
router.post('/invoices/:id/confirm', b2bInvoiceController.confirmInvoice);
router.post('/invoices/:id/reject', b2bInvoiceController.rejectInvoice);
router.post('/invoices/:id/request-correction', b2bInvoiceController.requestCorrection);

// ─── Chat / Messages ─────────────────────
router.get('/messages/:invoiceId', b2bMessageController.getMessages);
router.post('/messages/send', b2bMessageController.sendMessage);

// ─── Notifications ───────────────────────
router.get('/notifications', b2bNotificationController.getNotifications);
router.post('/notifications/mark-all-read', b2bNotificationController.markAllAsRead);
router.post('/notifications/:id/read', b2bNotificationController.markAsRead);

export default router;
