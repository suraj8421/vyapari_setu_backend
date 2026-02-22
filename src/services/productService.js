// ============================================
// Product Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, parseSort } from '../utils/helpers.js';

class ProductService {
    /**
     * Create product with initial inventory
     */
    async create(data) {
        const { initialStock, minStockLevel, maxStockLevel, batchNumber, expiryDate, location, ...productData } = data;

        return prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: productData,
            });

            // Create initial inventory record
            if (initialStock > 0 || minStockLevel) {
                await tx.inventory.create({
                    data: {
                        productId: product.id,
                        storeId: productData.storeId,
                        quantity: initialStock || 0,
                        minStockLevel: minStockLevel || 10,
                        maxStockLevel: maxStockLevel || null,
                        batchNumber: batchNumber || null,
                        expiryDate: expiryDate ? new Date(expiryDate) : null,
                        location: location || null,
                    },
                });
            }

            return product;
        });
    }

    /**
     * Get all products with filters, search, pagination
     */
    async getAll(query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);
        const orderBy = parseSort(query, 'name', 'asc');

        const where = {};
        if (storeId) where.storeId = storeId;
        if (query.storeId) where.storeId = query.storeId;
        if (query.category) where.category = query.category;
        if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
                { barcode: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    inventory: {
                        select: {
                            id: true,
                            quantity: true,
                            minStockLevel: true,
                            batchNumber: true,
                            expiryDate: true,
                            location: true,
                        },
                    },
                    store: {
                        select: { id: true, name: true },
                    },
                },
            }),
            prisma.product.count({ where }),
        ]);

        return { products, pagination: { page, limit, total } };
    }

    /**
     * Get product by ID
     */
    async getById(id) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                inventory: true,
                store: { select: { id: true, name: true } },
            },
        });

        if (!product) {
            throw { statusCode: 404, message: 'Product not found' };
        }

        return product;
    }

    /**
     * Update product
     */
    async update(id, data) {
        return prisma.product.update({
            where: { id },
            data,
            include: {
                inventory: true,
            },
        });
    }

    /**
     * Soft delete product
     */
    async delete(id) {
        return prisma.product.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Get all unique categories
     */
    async getCategories(storeId = null) {
        const where = { isActive: true };
        if (storeId) where.storeId = storeId;

        const categories = await prisma.product.findMany({
            where,
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });

        return categories
            .map((p) => p.category)
            .filter(Boolean);
    }

    /**
     * Get low stock products
     */
    async getLowStock(storeId = null) {
        const where = {
            product: { isActive: true },
        };
        if (storeId) where.storeId = storeId;

        const lowStockItems = await prisma.inventory.findMany({
            where: {
                ...where,
                quantity: { lte: prisma.inventory.fields?.minStockLevel },
            },
            include: {
                product: {
                    select: { id: true, name: true, sku: true, category: true },
                },
                store: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { quantity: 'asc' },
        });

        // Filter in application layer since Prisma doesn't support column comparison directly
        return lowStockItems.filter((item) => item.quantity <= item.minStockLevel);
    }
}

export default new ProductService();
