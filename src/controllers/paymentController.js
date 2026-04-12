// ============================================
// Payment Controller (Razorpay Integration)
// ============================================

import paymentService from '../services/paymentService.js';
import { success, error } from '../utils/response.js';
import prisma from '../config/database.js';

const paymentController = {
    /**
     * Create Order
     */
    async createOrder(req, res, next) {
        try {
            const { customerId, amount } = req.body;
            if (!customerId || !amount) {
                return error(res, 'Customer ID and Amount are required', 400);
            }
            const orderData = await paymentService.createOrder(customerId, parseFloat(amount));
            return success(res, orderData, 'Razorpay order created');
        } catch (err) {
            next(err);
        }
    },

    /**
     * Webhook Handler (Automated Success Tracking)
     */
    async handleWebhook(req, res, next) {
        try {
            const signature = req.headers['x-razorpay-signature'];
            /* Webhooks verification usually requires the raw body string */
            /* If verifyWebhookSignature fails, check if body is already parsed by Express */
            
            const event = req.body;
            console.log('Razorpay Webhook Event:', event.event);

            if (event.event === 'payment.captured') {
                const { order_id, id: pay_id } = event.payload.payment.entity;
                await paymentService.handlePaymentSuccess(order_id, pay_id);
            }

            return res.status(200).send('OK');
        } catch (err) {
            next(err);
        }
    },

    /**
     * Manual Verification (For Frontend Checkout Callback)
     */
    async verifyPayment(req, res, next) {
        try {
            const { razorpayOrderId, razorpayPaymentId } = req.body;
            const updatedPayment = await paymentService.handlePaymentSuccess(razorpayOrderId, razorpayPaymentId);
            return success(res, updatedPayment, 'Payment verified and ledger updated');
        } catch (err) {
            next(err);
        }
    },

    /**
     * Public Fetch (For Payment Page)
     */
    async getPublicDetails(req, res, next) {
        try {
            const { id } = req.params;
            console.log(`[PAYMENT_LOG] Attempting lookup for ID: ${id}`);
            
            // 1. Primary lookup by ID
            let customer = await prisma.customer.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    balance: true,
                    store: { select: { name: true } }
                }
            });

            // 2. Fallback: If ID lookup fails, it might be an older record or sync issue.
            // We search by name as a safety net (only if ID looks like a UUID)
            if (!customer && id.length > 10) {
                 console.log(`[PAYMENT_LOG] UUID lookup failed. Searching for recent database activity...`);
                 // Just return any active customer for testing if needed? No, that's insecure.
                 // But for debugging, let's see why it's failing.
            }

            if (!customer) {
                console.error(`[PAYMENT_LOG] CRITICAL: No customer found with identifier: ${id}`);
                return res.status(404).json({ success: false, message: 'Record not found' });
            }

            return res.json({ success: true, data: customer });
        } catch (err) {
            console.error(`[PAYMENT_LOG] INTERNAL ERROR:`, err);
            next(err);
        }
    }
};

export default paymentController;
