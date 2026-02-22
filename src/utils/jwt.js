// ============================================
// JWT Utility Functions
// ============================================

import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(payload) {
    return jwt.sign(payload, config.jwt.accessSecret, {
        expiresIn: config.jwt.accessExpiry,
    });
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiry,
    });
}

/**
 * Verify access token
 */
export function verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.accessSecret);
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret);
}

/**
 * Generate both tokens
 */
export function generateTokenPair(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
    };

    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
}
