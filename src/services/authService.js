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
        const { employeeCode, storeName, planId, ...userData } = data;
        let assignedAgentId = null;

        if (employeeCode) {
            const employee = await prisma.employee.findUnique({
                where: { code: employeeCode },
            });
            if (employee) {
                assignedAgentId = employee.id;
            } else {
                throw { statusCode: 400, message: 'Invalid Employee ID' };
            }
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: userData.email },
        });

        if (existingUser) {
            throw { statusCode: 409, message: 'Email already registered' };
        }

        const hashedPassword = await bcrypt.hash(userData.password, config.bcryptRounds);

        // Transactional creation of Store and User
        const result = await prisma.$transaction(async (tx) => {
            let storeId = userData.storeId;
            let role = userData.role || 'STORE_USER';

            if (storeName) {
                const store = await tx.store.create({
                    data: {
                        name: storeName,
                        phone: userData.phone,
                    }
                });
                storeId = store.id;
                role = 'ADMIN';
            }

            const user = await tx.user.create({
                data: {
                    ...userData,
                    password: hashedPassword,
                    assignedAgentId,
                    storeId,
                    role,
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    storeId: true,
                    assignedAgentId: true,
                    createdAt: true,
                },
            });

            // If a plan was selected, we can record it (optional: create pending sub)
            if (planId && role === 'ADMIN') {
                await tx.systemPayment.create({
                    data: {
                        userId: user.id,
                        amount: 0, // Will be updated on actual payment
                        status: 'PENDING',
                        method: 'RAZORPAY',
                    }
                });
            }

            return user;
        });

        const tokens = generateTokenPair(result);

        // Save refresh token
        await prisma.user.update({
            where: { id: result.id },
            data: { refreshToken: tokens.refreshToken },
        });

        return { user: result, ...tokens };
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
        if (userId === 'super-admin-001') return;
        await prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }

    /**
     * Get current user profile
     */
    async getProfile(userId) {
        // Super Admin Mock Profile Bypass for Development
        if (userId === 'super-admin-001') {
            return {
                id: 'super-admin-001',
                email: 'super@vyaparisetu.com',
                firstName: 'System',
                lastName: 'Admin',
                phone: '0000000000',
                role: 'SUPERADMIN',
                storeId: null,
                store: null,
                isActive: true,
                createdAt: new Date(),
            };
        }

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
