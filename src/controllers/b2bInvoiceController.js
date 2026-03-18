import b2bInvoiceService from '../services/b2bInvoiceService.js';
import { success } from '../utils/response.js';

class B2bInvoiceController {
    async createInvoice(req, res, next) {
        try {
            const userId = req.user.id;
            const sellerStoreId = req.user.storeId;
            const io = req.app.locals.io;
            // Pass io so approvalNotificationService.create() can emit notification_created
            const invoice = await b2bInvoiceService.createInvoice(sellerStoreId, req.body, userId, io);

            // Additional domain-specific socket event for invoice-room listeners
            if (io) {
                io.to(`store_${invoice.buyerStoreId}`).emit('new_invoice_request', invoice);
            }

            return success(res, invoice, 'B2B Invoice sent successfully', 201);
        } catch (err) {
            next(err);
        }
    }

    async confirmInvoice(req, res, next) {
        try {
            const userId = req.user.id;
            const buyerStoreId = req.user.storeId;
            const { id } = req.params;
            
            const confirmed = await b2bInvoiceService.confirmInvoice(id, buyerStoreId, userId);

            // Notify seller via socket
            if (req.app.locals.io) {
                req.app.locals.io.to(`store_${confirmed.sellerStoreId}`).emit('invoice_confirmed', confirmed);
            }

            return success(res, confirmed, 'B2B Invoice confirmed. Ledgers synchronized.');
        } catch (err) {
            next(err);
        }
    }

    async rejectInvoice(req, res, next) {
        try {
            const buyerStoreId = req.user.storeId;
            const { id } = req.params;
            const { reason } = req.body;
            
            const rejected = await b2bInvoiceService.rejectInvoice(id, buyerStoreId, reason);

            if (req.app.locals.io) {
                req.app.locals.io.to(`store_${rejected.sellerStoreId}`).emit('invoice_rejected', rejected);
            }

            return success(res, rejected, 'Invoice rejected');
        } catch (err) {
            next(err);
        }
    }

    async requestCorrection(req, res, next) {
        try {
            const buyerStoreId = req.user.storeId;
            const { id } = req.params;
            const { reason } = req.body;
            
            const updated = await b2bInvoiceService.requestCorrection(id, buyerStoreId, reason);

            if (req.app.locals.io) {
                req.app.locals.io.to(`store_${updated.sellerStoreId}`).emit('invoice_correction_requested', updated);
            }

            return success(res, updated, 'Correction requested');
        } catch (err) {
            next(err);
        }
    }

    async getStoreInvoices(req, res, next) {
        try {
            const storeId = req.user.storeId;
            const invoices = await b2bInvoiceService.getStoreInvoices(storeId);
            return success(res, invoices, 'B2B Invoices fetched');
        } catch (err) {
            next(err);
        }
    }
}

export default new B2bInvoiceController();
