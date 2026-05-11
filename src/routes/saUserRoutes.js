import express from 'express';
import { 
    getDashboardAnalytics, getAllUsers, getUserById, createUser, 
    updateUser, changeUserStatus, softDeleteUser, hardDeleteUser, 
    addPayment, assignSubscription, exportUsers, exportPayments, exportSubscriptions
} from '../controllers/saUserController.js';

const router = express.Router();

router.get('/analytics', getDashboardAnalytics);
router.get('/export', exportUsers);
router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/status', changeUserStatus);
router.delete('/:id', softDeleteUser);
router.delete('/:id/hard', hardDeleteUser);

// Payments & Subscriptions logic mapped strictly via CRM user ID
router.post('/payments', addPayment);
router.get('/payments/export', exportPayments);
router.post('/subscriptions/assign', assignSubscription);
router.get('/subscriptions/export', exportSubscriptions);

export default router;
