import prisma from '../config/database.js';
import { AppError } from '../utils/AppError.js';

class B2bMessageService {
    /**
     * Get chat history for a specific invoice
     */
    async getMessages(invoiceId, storeId) {
        // Auth check: store must be either buyer or seller of the invoice
        const invoice = await prisma.storeInvoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new AppError("Invoice not found", 404);

        if (invoice.sellerStoreId !== storeId && invoice.buyerStoreId !== storeId) {
            throw new AppError("Unauthorized access to this chat", 403);
        }

        return await prisma.storeMessage.findMany({
            where: { invoiceId },
            include: {
                senderStore: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    /**
     * Send a new message in an invoice chat thread
     */
    async sendMessage(invoiceId, senderStoreId, messageText) {
        const invoice = await prisma.storeInvoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new AppError("Invoice not found", 404);

        if (invoice.sellerStoreId !== senderStoreId && invoice.buyerStoreId !== senderStoreId) {
            throw new AppError("Unauthorized access to this chat", 403);
        }

        const message = await prisma.storeMessage.create({
            data: {
                invoiceId,
                senderStoreId,
                messageText
            },
            include: {
                senderStore: { select: { id: true, name: true } }
            }
        });

        // Determine who the receiver is
        const receiverStoreId = invoice.sellerStoreId === senderStoreId ? invoice.buyerStoreId : invoice.sellerStoreId;

        // Notify Receiver
        const receiverUser = await prisma.user.findFirst({ where: { storeId: receiverStoreId } });
        if (receiverUser) {
            await prisma.storeNotification.create({
                data: {
                    userId: receiverUser.id,
                    type: 'CHAT_MESSAGE',
                    message: `New message from ${message.senderStore.name} regarding Invoice.`,
                    relatedInvoiceId: invoice.id
                }
            });
        }

        return message;
    }
}

export default new B2bMessageService();
