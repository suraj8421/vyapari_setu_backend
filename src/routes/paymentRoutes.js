// ============================================
// Payment Routes (Razorpay Integration)
// ============================================

import express from 'express';
import paymentController from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

// Public routes (No login required)
router.get('/public/customer/:id', paymentController.getPublicDetails);

export default router;
