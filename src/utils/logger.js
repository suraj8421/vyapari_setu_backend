// ============================================
// Structured Logger (pino)
// ============================================
// PRODUCTION: Outputs structured JSON for log aggregation (Datadog, CloudWatch, etc.)
// DEVELOPMENT: Outputs colorized, human-readable logs via pino-pretty
//
// Usage:
//   import logger from './utils/logger.js';
//   logger.info({ userId }, 'User logged in');
//   logger.warn({ endpoint: req.url, time }, 'Slow response');
//   logger.error({ err, stack: err.stack }, 'Unhandled error');

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',

    // In development: pretty-print with colors
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
            },
        },
    }),

    // Base fields on every log line
    base: {
        service: 'vyaparisetu-api',
        env: process.env.NODE_ENV || 'development',
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    // Redact sensitive fields so they never appear in logs
    redact: {
        paths: [
            'req.headers.authorization',
            'body.password',
            'body.refreshToken',
            '*.password',
            '*.refreshToken',
        ],
        censor: '[REDACTED]',
    },
});

export default logger;
