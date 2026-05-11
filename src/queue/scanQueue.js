// ============================================
// SmartScan BullMQ Queue — Shared Instance
// ============================================

import { Queue } from 'bullmq';
import Redis from 'ioredis';

/**
 * Shared Redis connection config.
 * Reads from .env: REDIS_HOST, REDIS_PORT
 */
export const redisConnection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // Required for BullMQ
    connectTimeout: 10000,      // Increased for production stability
};

/**
 * Check if Redis is actually reachable.
 */
export async function isRedisRunning() {
    const redis = new Redis(redisConnection);
    try {
        await redis.ping();
        await redis.quit();
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * The single shared BullMQ queue for invoice scan jobs.
 */
export const scanQueue = new Queue('smartscan-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
    },
});

// Silence noise if Redis is down
scanQueue.on('error', (err) => {
    if (err.message.includes('ECONNREFUSED')) {
        // Just log once or silently fail - the controller has a fallback
        return;
    }
    console.error('[Queue] BullMQ Error:', err.message);
});


export default scanQueue;
