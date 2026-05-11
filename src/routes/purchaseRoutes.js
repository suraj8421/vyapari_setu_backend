// ============================================
// Purchase Routes
// ============================================

import express from 'express';
import multer from 'multer';
import purchaseController from '../controllers/purchaseController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createPurchaseSchema } from '../validators/schemas.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

// ── SmartScan routes (MUST be before /:id wildcard) ──────────────────────
// POST /api/purchases/scan          → queue a scan job, return { jobId }
router.post('/scan', upload.array('files', 20), purchaseController.queueScan);
// GET  /api/purchases/scan-status/:jobId → poll job state
router.get('/scan-status/:jobId', purchaseController.getScanStatus);

// ── Standard CRUD routes ──────────────────────────────────────────────────
// POST /api/purchases - Admin only
router.post('/', authorize('ADMIN'), validateBody(createPurchaseSchema), purchaseController.create);

// GET /api/purchases
router.get('/', purchaseController.getAll);

// GET /api/purchases/:id
router.get('/:id', purchaseController.getById);

// PATCH /api/purchases/:id/status - Admin only
router.patch('/:id/status', authorize('ADMIN'), purchaseController.updateStatus);

export default router;
