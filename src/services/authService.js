// ============================================
// Auth Service
// ============================================

import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import config from '../config/index.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';

class AuthService {
    /**
     * Register a new user
     */
    async register(data) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw { statusCode: 409, message: 'Email already registered' };
        }

        const hashedPassword = await bcrypt.hash(data.password, config.bcryptRounds);

        const user = await prisma.user.create({
            data: {
                ...data,
                password: hashedPassword,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                storeId: true,
                createdAt: true,
            },
        });

        const tokens = generateTokenPair(user);

        // Save refresh token
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken },
        });

        return { user, ...tokens };
    }

    /**
     * Login user
     */
    async login(email, password) {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            throw { statusCode: 401, message: 'Invalid email or password' };
        }

        if (!user.isActive) {
            throw { statusCode: 403, message: 'Your account has been deactivated' };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw { statusCode: 401, message: 'Invalid email or password' };
        }

        const tokens = generateTokenPair(user);

        // Save refresh token
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken },
        });

        const { password: _, refreshToken: __, ...userWithoutSensitive } = user;

        return { user: userWithoutSensitive, ...tokens };
    }

    /**
     * Refresh access token
     */
    async refreshToken(refreshToken) {
        try {
            const decoded = verifyRefreshToken(refreshToken);

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
            });

            if (!user || user.refreshToken !== refreshToken || !user.isActive) {
                throw { statusCode: 401, message: 'Invalid refresh token' };
            }

            const tokens = generateTokenPair(user);

            // Rotate refresh token
            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: tokens.refreshToken },
            });

            return tokens;
        } catch (err) {
            if (err.statusCode) throw err;
            throw { statusCode: 401, message: 'Invalid or expired refresh token' };
        }
    }

    /**
     * Logout user
     */
    async logout(userId) {
        await prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }

    /**
     * Get current user profile
     */
    async getProfile(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                storeId: true,
                store: {
                    select: { 
                        id: true, 
                        name: true,
                        address: true,
                        city: true,
                        state: true,
                        pincode: true,
                        phone: true,
                        gstNumber: true
                    },
                },
                isActive: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw { statusCode: 404, message: 'User not found' };
        }

        return user;
    }
}

export default new AuthService();
