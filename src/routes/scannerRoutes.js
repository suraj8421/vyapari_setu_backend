// ============================================
// Scanner API Routes
// ============================================

import express from 'express';
import multer from 'multer';
import scannerController from '../controllers/scannerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Store files in memory buffer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// POST /api/scanner/barcode
router.post('/barcode', scannerController.scanBarcode);

// POST /api/scanner/image
router.post('/image', upload.single('image'), scannerController.processImage);

// POST /api/scanner/document
router.post('/document', upload.single('document'), scannerController.processDocument);

export default router;
