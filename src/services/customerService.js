// ============================================
// Customer Service (Khata Management)
// ============================================

import prisma from '../config/database.js';
import { parsePagination } from '../utils/helpers.js';
import creditScoreService from './creditScoreService.js';

class CustomerService {
    async create(data) {
        return prisma.customer.create({ data });
    }

    async getAll(query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);

        const where = {};
        if (storeId) where.storeId = storeId;
        if (query.storeId) where.storeId = query.storeId;
        if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        // Filter by balance (outstanding credit customers)
        if (query.hasBalance === 'true') {
            where.balance = { gt: 0 };
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { name: 'asc' },
                include: {
                    store: { select: { id: true, name: true } },
                    _count: { select: { sales: true, ledgerEntries: true } },
                },
            }),
            prisma.customer.count({ where }),
        ]);

        return { customers, pagination: { page, limit, total } };
    }

    async getById(id) {
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                store: { select: { id: true, name: true } },
                ledgerEntries: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                    include: {
                        sale: { select: { id: true, invoiceNumber: true } },
                        recordedBy: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
                _count: { select: { sales: true, ledgerEntries: true } },
            },
        });

        if (!customer) {
            throw { statusCode: 404, message: 'Customer not found' };
        }

        return customer;
    }

    async update(id, data) {
        return prisma.customer.update({ where: { id }, data });
    }

    async delete(id) {
        return prisma.customer.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Get customer ledger (khata) entries
     */
    async getLedger(customerId, query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);

        const where = {};

        // If customerId is 'all', target all customers (optionally in a store)
        if (customerId !== 'all') {
            where.customerId = customerId;
        } else if (storeId || query.storeId) {
            where.customer = { storeId: storeId || query.storeId };
        }

        if (query.type) where.type = query.type;

        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) where.createdAt.gte = new Date(query.startDate);
            if (query.endDate) where.createdAt.lte = new Date(query.endDate);
        }

        const [entries, total] = await Promise.all([
            prisma.ledgerEntry.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    customer: { select: { id: true, name: true } },
                    sale: { select: { id: true, invoiceNumber: true } },
                    recordedBy: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            prisma.ledgerEntry.count({ where }),
        ]);

        return { entries, pagination: { page, limit, total } };
    }

    /**
     * Record payment (debit entry = customer pays)
     */
    async recordPayment(data, userId) {
        return prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUnique({
                where: { id: data.customerId },
            });

            if (!customer) {
                throw { statusCode: 404, message: 'Customer not found' };
            }

            const newBalance = Number(customer.balance) - data.amount;

            // Update customer balance
            await tx.customer.update({
                where: { id: data.customerId },
                data: { balance: newBalance },
            });

            // Create ledger entry
            const entry = await tx.ledgerEntry.create({
                data: {
                    customerId: data.customerId,
                    type: 'DEBIT',
                    amount: data.amount,
                    paymentMethod: data.paymentMethod || 'CASH',
                    description: data.description || 'Payment received',
                    reference: data.reference || null,
                    balanceAfter: newBalance,
                    recordedById: userId,
                },
                include: {
                    customer: { select: { id: true, name: true, balance: true } },
                    recordedBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            // Trigger credit score calculation (Async)
            creditScoreService.calculateAndSaveScore(data.customerId);

            return entry;
        });
    }

    /**
     * Get customers with outstanding balance
     */
    async getOutstandingCredits(storeId = null) {
        const where = {
            balance: { gt: 0 },
            isActive: true,
        };
        if (storeId) where.storeId = storeId;

        return prisma.customer.findMany({
            where,
            orderBy: { balance: 'desc' },
            select: {
                id: true,
                name: true,
                phone: true,
                balance: true,
                creditLimit: true,
                creditScore: true,
                creditCategory: true,
                store: { select: { id: true, name: true } },
            },
        });
    }
}

export default new CustomerService();
