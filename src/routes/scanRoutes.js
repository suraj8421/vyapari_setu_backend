// ============================================
// SmartScan Routes
// POST /api/purchases/scan        → queue a scan job, return jobId
// GET  /api/purchases/scan-status/:id → poll job state
// ============================================

import express from 'express';
import multer from 'multer';
import { scanQueue } from '../queue/scanQueue.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// In-memory storage — we pass the buffer directly to BullMQ
// Max file size: 20MB (covers most invoices)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images (JPG, PNG, WebP) and PDF files are supported'));
        }
    },
});

// All scan routes require authentication
router.use(authenticate);

// ─── POST /api/purchases/scan ──────────────────────────────────────────────
// Accepts a file upload, adds a job to the BullMQ queue, returns { jobId }.
router.post('/scan', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded. Please attach an invoice image or PDF.',
            });
        }

        const { originalname, mimetype, buffer, size } = req.file;

        console.log(`[SmartScan] Queuing job: ${originalname} (${(size / 1024).toFixed(1)} KB)`);

        // Add to BullMQ — buffer is serialised as a plain array to survive Redis
        const job = await scanQueue.add('scan-job', {
            fileBuffer: Array.from(buffer), // Convert Buffer → plain array for Redis serialisation
            filename: originalname,
            mimetype,
            uploadedBy: req.user?.id || null,
            storeId: req.user?.storeId || null,
            enqueuedAt: new Date().toISOString(),
        });

        return res.status(202).json({
            success: true,
            jobId: job.id,
            status: 'queued',
            message: 'Invoice queued for processing. Poll /scan-status/:id for updates.',
        });
    } catch (err) {
        console.error('[SmartScan] Enqueue error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to queue scan job. Ensure Redis is running.',
            error: err.message,
        });
    }
});

// ─── GET /api/purchases/scan-status/:id ────────────────────────────────────
// Polls the BullMQ job state. Returns normalised status for the frontend.
//
// Returned statuses:
//   queued      → job is waiting in the queue
//   processing  → worker has picked it up
//   completed   → result is ready
//   failed      → something went wrong
router.get('/scan-status/:id', async (req, res) => {
    try {
        const job = await scanQueue.getJob(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                status: 'not_found',
                message: `Job ${req.params.id} not found. It may have expired.`,
            });
        }

        const state = await job.getState(); // waiting | active | completed | failed | delayed
        const result = job.returnvalue;

        // Map BullMQ internal states → clean API states
        const statusMap = {
            waiting: 'queued',
            delayed: 'queued',
            active: 'processing',
            completed: 'completed',
            failed: 'failed',
        };

        const status = statusMap[state] || state;

        if (status === 'completed') {
            return res.json({
                success: true,
                status: 'completed',
                result,
            });
        }

        if (status === 'failed') {
            return res.json({
                success: false,
                status: 'failed',
                error: job.failedReason || 'Unknown worker error',
            });
        }

        return res.json({ success: true, status });
    } catch (err) {
        console.error('[SmartScan] Status poll error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to check job status.',
            error: err.message,
        });
    }
});

export default router;
