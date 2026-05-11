// ============================================
// Auth Service
// ============================================

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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

        // Transactional creation of Store, User, and Subscription
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

            // ─── If Plan Selected, Provision Subscription ──────────────────
            if (planId && role === 'ADMIN') {
                const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
                if (plan) {
                    const start = new Date();
                    const end = new Date();
                    end.setMonth(end.getMonth() + plan.durationMonths);

                    const sub = await tx.clientSubscription.create({
                        data: {
                            userId: user.id,
                            planId: plan.id,
                            startDate: start,
                            endDate: end,
                            status: 'ACTIVE' // Automatically active on onboarding/conversion
                        }
                    });

                    // Record initial payment record
                    await tx.systemPayment.create({
                        data: {
                            userId: user.id,
                            amount: plan.price,
                            status: 'SUCCESS', // Marking as success for onboarding simplicity
                            method: 'OFFLINE',
                            subscriptionId: sub.id,
                            paymentId: 'ONBOARDING_PROVISION'
                        }
                    });
                }
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
                email: 'admin@khata.com',
                firstName: 'Super',
                lastName: 'Admin',
                phone: '9876543210',
                role: 'SUPERADMIN',
                storeId: null,
                store: null,
                isActive: true,
                createdAt: new Date(),
                activePlan: 'Enterprise (Mock)'
            };
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                store: true,
                clientSubscriptions: {
                    where: { status: 'ACTIVE' },
                    include: { plan: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!user) {
            throw { statusCode: 404, message: 'User not found' };
        }

        // Extract active subscription details
        const activeSub = user.clientSubscriptions?.[0];
        const activePlan = activeSub?.plan;
        
        // Remove sensitive fields
        const { password, refreshToken, ...safeUser } = user;

        return {
            ...safeUser,
            subscription: activeSub ? {
                planName: activePlan.name,
                price: activePlan.price,
                expiryDate: activeSub.endDate,
                durationMonths: activePlan.durationMonths,
                features: activePlan.features,
                status: activeSub.status
            } : null,
            activePlan: activePlan?.name || 'FREE' // Legacy support
        };
    }

    /**
     * Change user password
     */
    async changePassword(userId, { currentPassword, newPassword }) {
        if (userId === 'super-admin-001') {
            throw { statusCode: 403, message: 'Cannot change password for mock Super Admin' };
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw { statusCode: 404, message: 'User not found' };
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            throw { statusCode: 401, message: 'Current password is incorrect' };
        }

        const hashedPassword = await bcrypt.hash(newPassword, config.bcryptRounds);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
    }

    /**
     * Generate reset token for forgot password (by email or phone)
     */
    async forgotPassword(identifier) {
        // identifier can be { email: '...' } or { phone: '...' }
        const where = {};
        if (identifier.email) where.email = identifier.email;
        if (identifier.phone) where.phone = identifier.phone;

        const user = await prisma.user.findFirst({ where });
        if (!user) {
            throw { statusCode: 404, message: 'Account not found with this identifier' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpiry: expiry
            }
        });

        return { token };
    }

    /**
     * Reset password using token
     */
    async resetPassword(token, newPassword) {
        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpiry: { gt: new Date() }
            }
        });

        if (!user) {
            throw { statusCode: 400, message: 'Invalid or expired reset token' };
        }

        const hashedPassword = await bcrypt.hash(newPassword, config.bcryptRounds);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpiry: null
            }
        });
    }
}

export default new AuthService();
