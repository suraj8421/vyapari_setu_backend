// ============================================
// Purchase Controller
// ============================================

import purchaseService from '../services/purchaseService.js';
import { success, paginated } from '../utils/response.js';
import { scanQueue } from '../queue/scanQueue.js';
import aiService from '../services/aiService.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the temp/scans directory relative to the project root (two levels up from src/controllers)
const TEMP_SCAN_DIR = path.resolve(__dirname, '..', '..', '..', 'temp', 'scans');

const purchaseController = {
    async create(req, res, next) {
        try {
            const purchase = await purchaseService.create(req.validatedBody, req.user.id);
            return success(res, purchase, 'Purchase created successfully', 201);
        } catch (err) {
            next(err);
        }
    },

    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const { purchases, pagination } = await purchaseService.getAll(req.query, storeId);
            return paginated(res, purchases, pagination, 'Purchases fetched');
        } catch (err) {
            next(err);
        }
    },

    async getById(req, res, next) {
        try {
            const purchase = await purchaseService.getById(req.params.id);
            return success(res, purchase, 'Purchase fetched');
        } catch (err) {
            next(err);
        }
    },

    async updateStatus(req, res, next) {
        try {
            const purchase = await purchaseService.updateStatus(req.params.id, req.body);
            return success(res, purchase, 'Purchase status updated');
        } catch (err) {
            next(err);
        }
    },

    // ─── SmartScan: Queue invoice scan job ──────────────────────────────
    async queueScan(req, res, next) {
        try {
            // Guard: ensure at least one file was uploaded
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No files uploaded. Please attach an invoice image or PDF.',
                });
            }

            // 1. Ensure the temp directory exists before writing files
            await fs.mkdir(TEMP_SCAN_DIR, { recursive: true });

            // 2. Save files to disk (avoids stuffing large buffers into Redis)
            const filesData = [];
            for (const f of req.files) {
                const ext = path.extname(f.originalname) || '.bin';
                const filename = `${crypto.randomUUID()}${ext}`;
                const filepath = path.join(TEMP_SCAN_DIR, filename);

                await fs.writeFile(filepath, f.buffer);

                filesData.push({
                    originalname: f.originalname,
                    mimetype: f.mimetype,
                    filepath, // Worker reads from this path
                });
            }

            // 3. Attempt to queue the job
            try {
                const job = await scanQueue.add('scan-job', {
                    files: filesData,
                    uploadedBy: req.user?.id || null,
                    storeId: req.user?.storeId || null,
                });

                console.log(`[SmartScan] Queued job ${job.id} with ${filesData.length} file(s)`);

                return res.status(202).json({
                    success: true,
                    jobId: job.id,
                    status: 'queued',
                    message: 'Invoice queued for processing.',
                });
            } catch (queueErr) {
                // ─── SYNC FALLBACK ──────────────────────────────────────────────
                // If Redis is down, we process it synchronously and return result now
                console.warn('[SmartScan] Queue failed (Redis down?). Falling back to sync processing...', queueErr.message);
                
                try {
                    const result = await aiService.process(req.files, req.user?.storeId);
                    
                    return res.status(200).json({
                        success: true,
                        status: 'completed',
                        result,
                        message: 'Processed synchronously (Queue unavailable).'
                    });
                } catch (aiErr) {
                    throw new Error(`AI processing failed: ${aiErr.message}`);
                }
            }
        } catch (err) {
            console.error('[SmartScan] Queue error:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to queue scan. Ensure Redis is running.',
                error: err.message,
            });
        }
    },

    // ─── SmartScan: Poll job status ─────────────────────────────────────
    async getScanStatus(req, res, next) {
        try {
            const { jobId } = req.params;

            if (!jobId) {
                return res.status(400).json({ success: false, status: 'error', message: 'Job ID is required.' });
            }

            const job = await scanQueue.getJob(jobId);

            if (!job) {
                console.warn(`[SmartScan] Job ${jobId} not found in queue (may have expired).`);
                // Return 'failed' instead of 404 so the frontend shows an error instead of getting stuck
                return res.status(200).json({
                    success: false,
                    status: 'failed',
                    error: 'Job not found. It may have expired or been cleaned up.',
                });
            }

            const state = await job.getState();
            console.log(`[SmartScan] Job ${jobId} state: ${state}`);

            const statusMap = {
                waiting: 'queued',
                delayed: 'queued',
                active: 'processing',
                completed: 'completed',
                failed: 'failed',
                unknown: 'failed',
            };
            const status = statusMap[state] || 'failed';

            if (status === 'completed') {
                return res.json({ success: true, status: 'completed', result: job.returnvalue });
            }
            if (status === 'failed') {
                const reason = job.failedReason || 'AI processing failed. Please try again.';
                console.error(`[SmartScan] Job ${jobId} failed:`, reason);
                return res.json({ success: false, status: 'failed', error: reason });
            }

            return res.json({ success: true, status });
        } catch (err) {
            console.error('[SmartScan] Status Poll Error:', err);
            return res.status(500).json({
                success: false,
                status: 'failed',
                message: 'Internal server error while checking scan status.',
                error: err.message,
            });
        }
    },
};

export default purchaseController;

