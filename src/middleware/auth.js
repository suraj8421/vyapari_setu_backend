// ============================================
// Authentication Middleware
// ============================================

import { verifyAccessToken } from '../utils/jwt.js';
import { error } from '../utils/response.js';
import prisma from '../config/database.js';

/**
 * Verify JWT access token from Authorization header
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return error(res, 'Access denied. No token provided.', 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyAccessToken(token);

        // Verify user still exists and is active
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                storeId: true,
                isActive: true,
            },
        });

        if (!user || !user.isActive) {
            return error(res, 'User account is inactive or not found.', 401);
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return error(res, 'Token expired. Please refresh your token.', 401);
        }
        if (err.name === 'JsonWebTokenError') {
            return error(res, 'Invalid token.', 401);
        }
        return error(res, 'Authentication failed.', 401);
    }
}

/**
 * Role-based authorization middleware factory
 */
export function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return error(res, 'Authentication required.', 401);
        }

        if (!roles.includes(req.user.role)) {
            return error(res, 'Access denied. Insufficient permissions.', 403);
        }

        next();
    };
}

/**
 * Store-scoped access middleware
 * Ensures users can only access data from their assigned store
 */
export function storeScope(req, res, next) {
    if (req.user.role === 'ADMIN') {
        // Admins can access all stores
        return next();
    }

    // Store users are scoped to their store
    if (!req.user.storeId) {
        return error(res, 'No store assigned to this user.', 403);
    }

    // Override any storeId in params/query/body with user's store
    if (req.params.storeId) {
        req.params.storeId = req.user.storeId;
    }

    req.storeId = req.user.storeId;
    next();
}
