// ============================================
// SmartScan Worker — Standalone Background Process
//
// Run with:  npm run worker
//
// This process runs separately from the Express server.
// It picks jobs from BullMQ, forwards the file to the
// FastAPI AI service (/ocr), and stores the result so
// the Express status endpoint can return it.
// ============================================

import 'dotenv/config';
import { Worker } from 'bullmq';
import axios from 'axios';
import FormData from 'form-data';

import { matchDatabaseRecords } from './semanticMatcher.js';
import { mapToSchema } from './scanMapper.js';

// Must match the queue name in scanQueue.js
const QUEUE_NAME = 'smartscan-queue';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/ocr';
const AI_SERVICE_URL_MULTI = process.env.AI_SERVICE_URL_MULTI || 'http://127.0.0.1:8000/ocr/multi';

const redisConnection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
};

console.log(`🚀 SmartScan Worker starting...`);
console.log(`   Queue  : ${QUEUE_NAME}`);
console.log(`   Redis  : ${redisConnection.host}:${redisConnection.port}`);
console.log(`   AI URL : ${AI_SERVICE_URL_MULTI}`);

// ─── Job Processor ────────────────────────────────────────────────────────
async function processJob(job) {
    const { files, storeId } = job.data;

    console.log(`\n[Worker] ▶ Job ${job.id} | Processing ${files?.length || 1} file(s)`);

    const form = new FormData();
    
    // Support both single file buffer (legacy) and multi files array
    if (files && Array.isArray(files)) {
        for (const file of files) {
            const buffer = Buffer.from(file.fileBuffer);
            form.append('files', buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
                knownLength: buffer.length,
            });
        }
    } else if (job.data.fileBuffer) {
        // Fallback for single file (legacy)
        const buffer = Buffer.from(job.data.fileBuffer);
        form.append('files', buffer, {
            filename: job.data.filename,
            contentType: job.data.mimetype,
            knownLength: buffer.length,
        });
    } else {
        throw new Error('No files provided in job data');
    }

    try {
        const response = await axios.post(AI_SERVICE_URL_MULTI, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 120000, // 120s — generous timeout for large multi-page PDFs
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        let result = response.data;

        console.log(`[Worker] AI Processing Completed | Valid=${result.is_valid} | Confidence=${result.confidence_score}`);

        // 1. Semantic Matching (Supplier & Product IDs)
        if (storeId) {
            result = await matchDatabaseRecords(result, storeId);
        }

        // 2. Strict Schema Mapping & Validation
        const finalPayload = mapToSchema(result);

        console.log(`[Worker] ✅ Job ${job.id} mapping completed successfully.`);

        return finalPayload;
    } catch (err) {
        const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
        console.error(`[Worker] ❌ Job ${job.id} failed | ${detail}`);
        // Throwing causes BullMQ to mark the job as failed (triggers retry logic)
        throw new Error(`AI service error: ${detail}`);
    }
}

// ─── Worker Instance ───────────────────────────────────────────────────────
const worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 3, // Process up to 3 invoices simultaneously
    limiter: {
        max: 10,      // Max 10 jobs per 30 seconds (rate limiting for AI service)
        duration: 30000,
    },
});

// ─── Worker Events ─────────────────────────────────────────────────────────
worker.on('completed', (job, result) => {
    console.log(`[Worker] 🎉 Job ${job.id} stored — ${result?.filename || 'unknown file'}`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] 💥 Job ${job?.id} permanently failed: ${err.message}`);
});

worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
});

worker.on('ready', () => {
    console.log('\n[Worker] 🟢 Connected to Redis and waiting for jobs...\n');
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
    await worker.close();
    console.log('[Worker] Worker closed. Goodbye.');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
