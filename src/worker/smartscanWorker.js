// ============================================
// SmartScan Worker — In-Process BullMQ Worker
//
// This file is imported once by server.js on startup.
// It runs inside the same Node.js process as Express.
// ============================================

import { Worker } from 'bullmq';
import { redisConnection, isRedisRunning } from '../queue/scanQueue.js';
import aiService from '../services/aiService.js';
import fs from 'fs/promises';

/**
 * SmartScan BullMQ Worker
 * Processes AI OCR jobs from the 'smartscan-queue'.
 */
async function startWorker() {
    const reachable = await isRedisRunning();
    
    if (!reachable) {
        console.warn('[Worker] ⚠️ Redis is unavailable. Background SmartScan worker will NOT start.');
        console.warn('[Worker] ℹ️ The system will automatically use Synchronous Fallback (Direct AI) instead.');
        return null;
    }

    const worker = new Worker(
        'smartscan-queue',
        async (job) => {
            const { files, storeId } = job.data;
            console.log(`[Worker] ⚡ Processing job ${job.id}: ${files?.length} files`);

            try {
                // Use the centralized AI service logic
                const result = await aiService.process(files, storeId);
                return result;
            } catch (err) {
                console.error(`[Worker] ❌ Processing failed for job ${job.id}:`, err.message);
                throw err; // Re-throw so BullMQ knows it failed
            } finally {
                // ─── CLEANUP ────────────────────────────────────────────────────────
                // Always delete temp files from disk to prevent storage bloat
                if (files && files.length > 0) {
                    for (const f of files) {
                        try {
                            await fs.unlink(f.filepath);
                        } catch (err) {
                            console.warn(`[Worker] Cleanup failed for ${f.filepath}:`, err.message);
                        }
                    }
                }
            }
        },
        {
            connection: redisConnection,
            concurrency: 2, // Process up to 2 invoices at once
        }
    );

    worker.on('completed', (job) => console.log(`[Worker] ✅ Job ${job.id} done`));
    worker.on('failed', (job, err) => console.error(`[Worker] ❌ Job ${job?.id} failed:`, err.message));
    worker.on('ready', () => console.log('[Worker] 🟢 SmartScan background worker ready.'));

    return worker;
}

// Start the worker asynchronously
const workerPromise = startWorker();
export default workerPromise;

