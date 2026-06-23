// ============================================
// Payment Service (Razorpay & Hybrid Logic)
// ============================================

import Razorpay from 'razorpay';
import crypto from 'crypto';
import prisma from '../config/database.js';
import creditScoreService from './creditScoreService.js';

class PaymentService {
    constructor() {
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
            key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret'
        });
    }

    /**
     * Get payment settings (Fee logic)
     */
    async getSettings() {
        let settings = await prisma.paymentSettings.findFirst();
        if (!settings) {
            settings = await prisma.paymentSettings.create({
                data: { id: 'global-settings', feeType: 'OWNER', razorpayActive: true }
            });
        }
        return settings;
    }

    /**
     * Calculate fees based on setting
     */
    calculateFinalAmount(baseAmount, feeType) {
        const feePercent = 0.02; // 2% flat for Razorpay
        let feeAmount = 0;
        let totalAmount = baseAmount;

        if (feeType === 'CUSTOMER') {
            feeAmount = baseAmount * feePercent;
            totalAmount = baseAmount + feeAmount;
        } else if (feeType === 'OWNER') {
            feeAmount = baseAmount * feePercent;
            totalAmount = baseAmount; 
            // In OWNER type, we collect baseAmount but shop pays the fee from their pocket downstream
        } else if (feeType === 'SPLIT') {
            feeAmount = baseAmount * (feePercent / 2);
            totalAmount = baseAmount + feeAmount;
        }

        return {
            baseAmount,
            feeAmount: parseFloat(feeAmount.toFixed(2)),
            totalAmount: parseFloat(totalAmount.toFixed(2))
        };
    }

    /**
     * Create Razorpay Order
     */
    async createOrder(customerId, amount) {
        const settings = await this.getSettings();
        const { feeAmount, totalAmount } = this.calculateFinalAmount(amount, settings.feeType);

        // Create Razorpay order
        const options = {
            amount: Math.round(totalAmount * 100), // convert to paise
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
        };

        const rpOrder = await this.razorpay.orders.create(options);

        // Link with OnlinePayment record
        const payment = await prisma.onlinePayment.create({
            data: {
                customerId,
                amount,
                feeAmount,
                totalAmount,
                razorpayOrderId: rpOrder.id,
                status: 'PENDING',
                method: 'ONLINE'
            }
        });

        return {
            paymentId: payment.id,
            orderId: rpOrder.id,
            totalAmount,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID
        };
    }

    /**
     * Verify Webhook Signature
     */
    verifyWebhookSignature(body, signature) {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(body))
            .digest('hex');
        return signature === expectedSignature;
    }

    /**
     * Success Logic: Update Ledger & Balance
     */
    async handlePaymentSuccess(razorpayOrderId, razorpayPaymentId) {
        return prisma.$transaction(async (tx) => {
            const payment = await tx.onlinePayment.findUnique({
                where: { razorpayOrderId },
                include: { customer: true }
            });

            if (!payment || payment.status === 'SUCCESS') return payment;

            // Update payment record
            const updatedPayment = await tx.onlinePayment.update({
                where: { id: payment.id },
                data: {
                    status: 'SUCCESS',
                    razorpayPayId: razorpayPaymentId
                }
            });

            const newBalance = Number(payment.customer.balance) - Number(payment.amount);

            // Update customer balance (automated debit from their credit)
            await tx.customer.update({
                where: { id: payment.customerId },
                data: { balance: newBalance }
            });

            // Create ledger entry
            await tx.ledgerEntry.create({
                data: {
                    customerId: payment.customerId,
                    type: 'DEBIT',
                    amount: payment.amount,
                    paymentMethod: 'ONLINE',
                    description: `Online Payment (Ref: ${razorpayPaymentId})`,
                    reference: razorpayPaymentId,
                    balanceAfter: newBalance,
                    recordedById: null // System-automated payment (no human actor)
                }
            });

            // Trigger credit score update
            creditScoreService.calculateAndSaveScore(payment.customerId);

            return updatedPayment;
        });
    }
}

export default new PaymentService();
