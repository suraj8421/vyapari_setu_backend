// ============================================
// Supplier Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination } from '../utils/helpers.js';

class SupplierService {
    async create(data) {
        return prisma.supplier.create({ data });
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

        const [suppliers, total] = await Promise.all([
            prisma.supplier.findMany({
                where,
                skip,
                take: limit,
                orderBy: { name: 'asc' },
                include: {
                    store: { select: { id: true, name: true } },
                    _count: { select: { purchases: true } },
                },
            }),
            prisma.supplier.count({ where }),
        ]);

        return { suppliers, pagination: { page, limit, total } };
    }

    async getById(id) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: {
                store: { select: { id: true, name: true } },
                purchases: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    select: {
                        id: true,
                        invoiceNumber: true,
                        totalAmount: true,
                        paidAmount: true,
                        status: true,
                        createdAt: true,
                    },
                },
                _count: { select: { purchases: true } },
            },
        });

        if (!supplier) {
            throw { statusCode: 404, message: 'Supplier not found' };
        }

        return supplier;
    }

    async update(id, data) {
        return prisma.supplier.update({ where: { id }, data });
    }

    async delete(id) {
        return prisma.supplier.update({
            where: { id },
            data: { isActive: false },
        });
    }
}

export default new SupplierService();
