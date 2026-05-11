import express from 'express';
import * as planController from '../controllers/planController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Bypass middleware for the frontend "mock-super-token"
const superAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer mock-super-token')) {
        req.user = { role: 'SUPER_ADMIN', id: 'mock-super-admin-id' };
        return next();
    }
    return authenticate(req, res, next);
};

// Public route for public users taking subs (if needed later)
router.get('/', planController.getAllPlans);

// Admin Routes
router.get('/admin', superAdminAuth, planController.getAllAdminPlans);
router.post('/', superAdminAuth, planController.createPlan);
router.put('/:id', superAdminAuth, planController.updatePlan);
router.delete('/:id', superAdminAuth, planController.deletePlan);

export default router;
