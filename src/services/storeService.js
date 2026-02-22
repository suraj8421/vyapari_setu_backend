// ============================================
// Store Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, parseSort } from '../utils/helpers.js';

class StoreService {
    async create(data) {
        return prisma.store.create({ data });
    }

    async getAll(query = {}) {
        const { skip, limit, page } = parsePagination(query);
        const orderBy = parseSort(query);

        const where = {};
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { city: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query.isActive !== undefined) {
            where.isActive = query.isActive === 'true';
        }

        const [stores, total] = await Promise.all([
            prisma.store.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    _count: {
                        select: { users: true, products: true },
                    },
                },
            }),
            prisma.store.count({ where }),
        ]);

        return { stores, pagination: { page, limit, total } };
    }

    async getById(id) {
        const store = await prisma.store.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { users: true, products: true, sales: true, customers: true },
                },
            },
        });

        if (!store) {
            throw { statusCode: 404, message: 'Store not found' };
        }

        return store;
    }

    async update(id, data) {
        return prisma.store.update({
            where: { id },
            data,
        });
    }

    async delete(id) {
        return prisma.store.update({
            where: { id },
            data: { isActive: false },
        });
    }
}

export default new StoreService();
