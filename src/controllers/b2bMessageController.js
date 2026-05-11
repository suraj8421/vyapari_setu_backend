import b2bMessageService from '../services/b2bMessageService.js';
import { success } from '../utils/response.js';

class B2bMessageController {
    async getMessages(req, res, next) {
        try {
            const { invoiceId } = req.params;
            const storeId = req.user.storeId;
            const messages = await b2bMessageService.getMessages(invoiceId, storeId);
            return success(res, messages, 'Chat history fetched');
        } catch (err) {
            next(err);
        }
    }

    async sendMessage(req, res, next) {
        try {
            const { invoiceId, messageText } = req.body;
            const senderStoreId = req.user.storeId;
            const message = await b2bMessageService.sendMessage(invoiceId, senderStoreId, messageText);
            
            // Emit Socket event to the chat room tied to the invoice
            if (req.app.locals.io) {
                req.app.locals.io.to(`invoice_${invoiceId}`).emit('new_message', message);
            }

            return success(res, message, 'Message sent');
        } catch (err) {
            next(err);
        }
    }
}

export default new B2bMessageController();
