// ============================================
// Zod Validation Middleware
// ============================================

import { error } from '../utils/response.js';

/**
 * Validate request body against a Zod schema
 */
export function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return error(res, 'Validation failed', 400, errors);
        }
        req.validatedBody = result.data;
        next();
    };
}

/**
 * Validate request query against a Zod schema
 */
export function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return error(res, 'Invalid query parameters', 400, errors);
        }
        req.validatedQuery = result.data;
        next();
    };
}

/**
 * Validate request params against a Zod schema
 */
export function validateParams(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            const errors = result.error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return error(res, 'Invalid parameters', 400, errors);
        }
        req.validatedParams = result.data;
        next();
    };
}
