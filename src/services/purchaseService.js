// ============================================
// Purchase Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, generateInvoiceNumber } from '../utils/helpers.js';

class PurchaseService {
    /**
     * Create purchase with automatic stock increase
     */
    async create(data, userId) {
        return prisma.$transaction(async (tx) => {
            let subtotal = 0;
            let totalTax = 0;
            const purchaseItems = [];

            for (const item of data.items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                });

                if (!product) {
                    throw { statusCode: 404, message: `Product not found: ${item.productId}` };
                }

                const gstRate = Number(product.gstRate);
                const itemSubtotal = item.unitPrice * item.quantity;
                const gstAmount = (itemSubtotal * gstRate) / 100;
                const itemTotal = itemSubtotal + gstAmount;

                subtotal += itemSubtotal;
                totalTax += gstAmount;

                purchaseItems.push({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    gstRate,
                    gstAmount,
                    total: itemTotal,
                });

                // Increase stock
                const existingInventory = await tx.inventory.findFirst({
                    where: {
                        productId: item.productId,
                        storeId: data.storeId,
                    },
                });

                if (existingInventory) {
                    await tx.inventory.update({
                        where: { id: existingInventory.id },
                        data: { quantity: { increment: item.quantity } },
                    });
                } else {
                    await tx.inventory.create({
                        data: {
                            productId: item.productId,
                            storeId: data.storeId,
                            quantity: item.quantity,
                            minStockLevel: 10,
                        },
                    });
                }
            }

            const totalAmount = subtotal + totalTax;

            const purchase = await tx.purchase.create({
                data: {
                    invoiceNumber: data.invoiceNumber || generateInvoiceNumber('PUR'),
                    storeId: data.storeId,
                    supplierId: data.supplierId,
                    createdById: userId,
                    subtotal,
                    taxAmount: totalTax,
                    totalAmount,
                    paidAmount: data.paidAmount || 0,
                    status: 'RECEIVED',
                    notes: data.notes || null,
                    items: {
                        create: purchaseItems,
                    },
                },
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, name: true, sku: true } },
                        },
                    },
                    supplier: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            return purchase;
        });
    }

    /**
     * Get all purchases with filters
     */
    async getAll(query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);

        const where = {};
        if (storeId) where.storeId = storeId;
        if (query.storeId) where.storeId = query.storeId;
        if (query.supplierId) where.supplierId = query.supplierId;
        if (query.status) where.status = query.status;

        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) where.createdAt.gte = new Date(query.startDate);
            if (query.endDate) where.createdAt.lte = new Date(query.endDate);
        }

        const [purchases, total] = await Promise.all([
            prisma.purchase.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    supplier: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, sku: true } },
                        },
                    },
                },
            }),
            prisma.purchase.count({ where }),
        ]);

        return { purchases, pagination: { page, limit, total } };
    }

    async getById(id) {
        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: {
                supplier: true,
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: true } },
                store: true,
            },
        });

        if (!purchase) {
            throw { statusCode: 404, message: 'Purchase not found' };
        }

        return purchase;
    }
}

export default new PurchaseService();
