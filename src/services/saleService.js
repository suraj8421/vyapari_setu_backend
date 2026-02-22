// ============================================
// Sale Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, generateInvoiceNumber } from '../utils/helpers.js';

class SaleService {
    /**
     * Create a new sale with automatic stock deduction
     */
    async create(data, userId) {
        return prisma.$transaction(async (tx) => {
            let subtotal = 0;
            let totalTax = 0;
            const saleItems = [];

            // Process each item
            for (const item of data.items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    include: {
                        inventory: {
                            where: { storeId: data.storeId },
                        },
                    },
                });

                if (!product) {
                    throw { statusCode: 404, message: `Product not found: ${item.productId}` };
                }

                // Check stock
                const totalStock = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
                if (totalStock < item.quantity) {
                    throw {
                        statusCode: 400,
                        message: `Insufficient stock for ${product.name}. Available: ${totalStock}, Requested: ${item.quantity}`,
                    };
                }

                // Calculate item totals
                const itemSubtotal = item.unitPrice * item.quantity - (item.discount || 0);
                const gstRate = Number(product.gstRate);
                const gstAmount = (itemSubtotal * gstRate) / 100;
                const itemTotal = itemSubtotal + gstAmount;

                subtotal += itemSubtotal;
                totalTax += gstAmount;

                saleItems.push({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    gstRate,
                    gstAmount,
                    discount: item.discount || 0,
                    total: itemTotal,
                });

                // Deduct stock (FIFO from first inventory record)
                let remainingDeduction = item.quantity;
                for (const inv of product.inventory) {
                    if (remainingDeduction <= 0) break;

                    const deduction = Math.min(inv.quantity, remainingDeduction);
                    await tx.inventory.update({
                        where: { id: inv.id },
                        data: { quantity: { decrement: deduction } },
                    });
                    remainingDeduction -= deduction;
                }
            }

            const totalAmount = subtotal + totalTax - (data.discount || 0);
            const paidAmount = data.paidAmount !== undefined ? data.paidAmount : totalAmount;

            // Create sale
            const sale = await tx.sale.create({
                data: {
                    invoiceNumber: generateInvoiceNumber('INV'),
                    storeId: data.storeId,
                    customerId: data.customerId || null,
                    soldById: userId,
                    subtotal,
                    taxAmount: totalTax,
                    discount: data.discount || 0,
                    totalAmount,
                    paidAmount,
                    paymentMethod: data.paymentMethod || 'CASH',
                    notes: data.notes || null,
                    items: {
                        create: saleItems,
                    },
                },
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, name: true, sku: true } },
                        },
                    },
                    customer: { select: { id: true, name: true } },
                    soldBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            // If customer exists and paid less than total, create ledger entry (credit)
            if (data.customerId && paidAmount < totalAmount) {
                const creditAmount = totalAmount - paidAmount;

                const customer = await tx.customer.findUnique({
                    where: { id: data.customerId },
                });

                const newBalance = Number(customer.balance) + creditAmount;

                await tx.customer.update({
                    where: { id: data.customerId },
                    data: { balance: newBalance },
                });

                await tx.ledgerEntry.create({
                    data: {
                        customerId: data.customerId,
                        saleId: sale.id,
                        type: 'CREDIT',
                        amount: creditAmount,
                        paymentMethod: 'CREDIT',
                        description: `Sale ${sale.invoiceNumber} - Credit`,
                        balanceAfter: newBalance,
                        recordedById: userId,
                    },
                });
            }

            return sale;
        });
    }

    /**
     * Get all sales with filters
     */
    async getAll(query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);

        const where = {};
        if (storeId) where.storeId = storeId;
        if (query.storeId) where.storeId = query.storeId;
        if (query.customerId) where.customerId = query.customerId;
        if (query.status) where.status = query.status;
        if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

        // Date range filter
        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) where.createdAt.gte = new Date(query.startDate);
            if (query.endDate) where.createdAt.lte = new Date(query.endDate);
        }

        if (query.search) {
            where.invoiceNumber = { contains: query.search, mode: 'insensitive' };
        }

        const [sales, total] = await Promise.all([
            prisma.sale.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    customer: { select: { id: true, name: true, phone: true } },
                    soldBy: { select: { id: true, firstName: true, lastName: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, sku: true } },
                        },
                    },
                    store: { select: { id: true, name: true } },
                },
            }),
            prisma.sale.count({ where }),
        ]);

        return { sales, pagination: { page, limit, total } };
    }

    /**
     * Get sale by ID
     */
    async getById(id) {
        const sale = await prisma.sale.findUnique({
            where: { id },
            include: {
                customer: true,
                soldBy: { select: { id: true, firstName: true, lastName: true } },
                items: {
                    include: {
                        product: true,
                    },
                },
                store: true,
                ledgerEntries: true,
            },
        });

        if (!sale) {
            throw { statusCode: 404, message: 'Sale not found' };
        }

        return sale;
    }
}

export default new SaleService();
