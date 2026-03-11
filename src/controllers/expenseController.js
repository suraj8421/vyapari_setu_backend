// ============================================
// Expense Controller
// ============================================
// FIX: Expenses could be CREATED via the UnifiedEntry console, but there was
// no way to LIST or VIEW them. Admins and store users had no expense management
// page. This controller provides the listing and basic management functionality.

import prisma from '../config/database.js';
import { success, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/helpers.js';

const expenseController = {
    /**
     * Get all expenses with optional date range and category filters
     */
    async getAll(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const { skip, limit, page } = parsePagination(req.query);

            const where = {};
            if (storeId) where.storeId = storeId;
            if (req.query.category) where.category = { contains: req.query.category, mode: 'insensitive' };

            // Date range filter on the `date` field (not createdAt)
            if (req.query.startDate || req.query.endDate) {
                where.date = {};
                if (req.query.startDate) where.date.gte = new Date(req.query.startDate);
                if (req.query.endDate) where.date.lte = new Date(req.query.endDate);
            }

            const [expenses, total] = await Promise.all([
                prisma.expense.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { date: 'desc' },
                    include: {
                        store: { select: { id: true, name: true } },
                        recordedBy: { select: { id: true, firstName: true, lastName: true } },
                    },
                }),
                prisma.expense.count({ where }),
            ]);

            // Sum of expenses for the filtered period (useful for totals display)
            const aggregate = await prisma.expense.aggregate({
                where,
                _sum: { amount: true },
            });

            return res.json({
                success: true,
                data: expenses,
                pagination: { page, limit, total },
                totalAmount: Number(aggregate._sum.amount || 0),
                message: 'Expenses fetched',
            });
        } catch (err) {
            next(err);
        }
    },

    /**
     * Get single expense by ID
     */
    async getById(req, res, next) {
        try {
            const expense = await prisma.expense.findUnique({
                where: { id: req.params.id },
                include: {
                    store: { select: { id: true, name: true } },
                    recordedBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });
            if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
            return success(res, expense, 'Expense fetched');
        } catch (err) {
            next(err);
        }
    },

    /**
     * Get distinct expense categories (used for filter dropdowns)
     */
    async getCategories(req, res, next) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : null;
            const where = storeId ? { storeId } : {};
            const rows = await prisma.expense.findMany({
                where,
                select: { category: true },
                distinct: ['category'],
                orderBy: { category: 'asc' },
            });
            return success(res, rows.map(r => r.category), 'Categories fetched');
        } catch (err) {
            next(err);
        }
    },
};

export default expenseController;
