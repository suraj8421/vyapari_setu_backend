// ============================================
// Global Error Handler Middleware
// ============================================

import { error } from '../utils/response.js';
import config from '../config/index.js';

export default function errorHandler(err, req, res, _next) {
    console.error('Error:', err);

    // Prisma known errors
    if (err.code === 'P2002') {
        const field = err.meta?.target?.join(', ') || 'field';
        return error(res, `Duplicate value for ${field}. This record already exists.`, 409);
    }

    if (err.code === 'P2025') {
        return error(res, 'Record not found.', 404);
    }

    if (err.code === 'P2003') {
        return error(res, 'Related record not found. Check your references.', 400);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return error(res, 'Invalid token.', 401);
    }

    if (err.name === 'TokenExpiredError') {
        return error(res, 'Token expired.', 401);
    }

    // Zod validation (if thrown manually)
    if (err.name === 'ZodError') {
        const errors = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        return error(res, 'Validation error.', 400, errors);
    }

    // Default server error
    const message = config.nodeEnv === 'development' ? err.message : 'Internal server error';
    return error(res, message, err.statusCode || 500);
}
