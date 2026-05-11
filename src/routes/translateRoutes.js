
// ============================================
// Translate Routes
// ============================================

import express from 'express';
import translateController from '../controllers/translateController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Allow authenticated users (Staff & Admin) to translate
router.use(authenticate);

router.post('/', translateController.translateText);

export default router;
