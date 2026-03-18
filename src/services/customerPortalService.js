// ============================================
// Customer Portal Service
// ============================================
// Handles customer self-registration, login, notification management,
// and purchase history viewing. This is the "customer-side" of the
// two-way business network.

import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import config from '../config/index.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';

class CustomerPortalService {

    /**
     * Register a new CustomerAccount.
     * Requires the customer to have the same phone number already registered
     * as a Customer record by the business. This is how we "link" them.
     */
    async register(data) {
        const { email, password, phone, firstName, lastName } = data;

        // Ensure no duplicate portal account exists
        const existingAccount = await prisma.customerAccount.findUnique({ where: { email } });
        if (existingAccount) {
            throw new AppError('An account with this email already exists.', 409);
        }

        const existingPhone = await prisma.customerAccount.findUnique({ where: { phone } });
        if (existingPhone) {
            throw new AppError('An account with this phone number already exists.', 409);
        }

        // Find the underlying Customer record by phone (must exist first in the business system)
        const customer = await prisma.customer.findFirst({
            where: { phone, isWalkIn: false },
        });

        if (!customer) {
            throw new AppError(
                'No customer record found with this phone number. Please contact the business to register you first.',
                404
            );
        }

        // Check if that customer already has a portal account
        if (customer.customerAccount) {
            throw new AppError('This customer already has a portal account.', 409);
        }

        const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

        const account = await prisma.customerAccount.create({
            data: {
                email,
                password: hashedPassword,
                phone,
                customerId: customer.id,
            },
            select: {
                id: true,
                email: true,
                phone: true,
                createdAt: true,
                customer: { select: { id: true, name: true } },
            },
        });

        const tokens = generateTokenPair({ id: account.id, role: 'CUSTOMER', email: account.email });

        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { refreshToken: tokens.refreshToken },
        });

        return { account, ...tokens };
    }

    /**
     * Login a CustomerAccount
     */
    async login(email, password) {
        const account = await prisma.customerAccount.findUnique({
            where: { email },
            include: { customer: { select: { id: true, name: true } } },
        });

        if (!account) {
            throw new AppError('Invalid email or password.', 401);
        }

        if (!account.isActive) {
            throw new AppError('Your account has been deactivated.', 403);
        }

        const isPasswordValid = await bcrypt.compare(password, account.password);
        if (!isPasswordValid) {
            throw new AppError('Invalid email or password.', 401);
        }

        const tokens = generateTokenPair({ id: account.id, role: 'CUSTOMER', email: account.email });

        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { refreshToken: tokens.refreshToken },
        });

        const { password: _, refreshToken: __, ...safeAccount } = account;
        return { account: safeAccount, ...tokens };
    }

    /**
     * Refresh token for customer portal
     */
    async refreshToken(refreshToken) {
        try {
            const decoded = verifyRefreshToken(refreshToken);
            const account = await prisma.customerAccount.findUnique({ where: { id: decoded.userId } });

            if (!account || account.refreshToken !== refreshToken || !account.isActive) {
                throw new AppError('Invalid refresh token', 401);
            }

            const tokens = generateTokenPair({ id: account.id, role: 'CUSTOMER', email: account.email });

            await prisma.customerAccount.update({
                where: { id: account.id },
                data: { refreshToken: tokens.refreshToken },
            });

            return tokens;
        } catch (err) {
            if (err instanceof AppError) throw err;
            throw new AppError('Invalid or expired refresh token', 401);
        }
    }

    /**
     * Logout a customer — clears their refresh token
     */
    async logout(accountId) {
        await prisma.customerAccount.update({
            where: { id: accountId },
            data: { refreshToken: null },
        });
    }

    /**
     * Get the current customer's profile
     */
    async getProfile(accountId) {
        const account = await prisma.customerAccount.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                email: true,
                phone: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                        balance: true,
                        creditLimit: true,
                        store: { select: { id: true, name: true, city: true } },
                    },
                },
            },
        });
        if (!account) throw new AppError('Account not found.', 404);
        return account;
    }

    /**
     * Get pending and recent notifications for this customer.
     */
    async getNotifications(accountId, query = {}) {
        const { status } = query;
        const where = { customerAccountId: accountId };
        if (status) where.status = status;

        return prisma.customerNotification.findMany({
            where,
            include: {
                sale: {
                    include: {
                        items: {
                            include: {
                                product: { select: { id: true, name: true, unit: true } },
                            },
                        },
                        store: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Customer accepts a transaction notification.
     * Creates an audit log entry to record the customer acknowledgment.
     */
    async acceptNotification(notificationId, accountId) {
        const notification = await prisma.customerNotification.findUnique({
            where: { id: notificationId },
            include: { sale: true },
        });

        if (!notification || notification.customerAccountId !== accountId) {
            throw new AppError('Notification not found.', 404);
        }

        if (notification.status !== 'PENDING') {
            throw new AppError(`This notification has already been ${notification.status.toLowerCase()}.`, 400);
        }

        const updated = await prisma.customerNotification.update({
            where: { id: notificationId },
            data: { status: 'ACCEPTED' },
        });

        // Record in audit log for transparency
        await prisma.auditLog.create({
            data: {
                entityType: 'SALE',
                entityId: notification.saleId,
                action: 'CUSTOMER_ACCEPTED',
                newValue: { notificationId, customerAccountId: accountId, status: 'ACCEPTED' },
                changedById: notification.sale.soldById, // use the original seller as reference
                status: 'APPROVED',
                notes: 'Transaction accepted by customer via portal.',
            },
        });

        return updated;
    }

    /**
     * Customer rejects a transaction notification.
     * Stores the reason and creates an audit log entry.
     */
    async rejectNotification(notificationId, accountId, reason = '') {
        const notification = await prisma.customerNotification.findUnique({
            where: { id: notificationId },
            include: { sale: true },
        });

        if (!notification || notification.customerAccountId !== accountId) {
            throw new AppError('Notification not found.', 404);
        }

        if (notification.status !== 'PENDING') {
            throw new AppError(`This notification has already been ${notification.status.toLowerCase()}.`, 400);
        }

        const updated = await prisma.customerNotification.update({
            where: { id: notificationId },
            data: { status: 'REJECTED', rejectionReason: reason },
        });

        // Record rejection in audit log
        await prisma.auditLog.create({
            data: {
                entityType: 'SALE',
                entityId: notification.saleId,
                action: 'CUSTOMER_REJECTED',
                newValue: { notificationId, customerAccountId: accountId, status: 'REJECTED', reason },
                changedById: notification.sale.soldById,
                status: 'PENDING', // Requires admin review since customer disputed it
                notes: `Transaction disputed by customer. Reason: ${reason || 'No reason provided'}`,
            },
        });

        return updated;
    }

    /**
     * Get full purchase history for the logged-in customer.
     */
    async getPurchaseHistory(accountId, query = {}) {
        const account = await prisma.customerAccount.findUnique({
            where: { id: accountId },
            select: { customerId: true },
        });
        if (!account) throw new AppError('Account not found.', 404);

        const { skip = 0, take = 20 } = query;

        const [notifications, total] = await Promise.all([
            prisma.customerNotification.findMany({
                where: { customerAccountId: accountId },
                include: {
                    sale: {
                        include: {
                            items: {
                                include: {
                                    product: { select: { id: true, name: true, unit: true } },
                                },
                            },
                            store: { select: { id: true, name: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: Number(skip),
                take: Number(take),
            }),
            prisma.customerNotification.count({ where: { customerAccountId: accountId } }),
        ]);

        return { notifications, total };
    }
}

export default new CustomerPortalService();
