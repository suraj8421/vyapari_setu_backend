// ============================================
// Sale Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, generateInvoiceNumber } from '../utils/helpers.js';
// FIX: Import AppError so we get proper stack traces on thrown errors
import { AppError } from '../utils/AppError.js';

class SaleService {
    /**
     * Get or create a default walk-in customer for a store
     */
    async getOrCreateWalkInCustomer(storeId, tx) {
        const client = tx || prisma;
        let walkIn = await client.customer.findFirst({
            where: { storeId, isWalkIn: true },
        });

        if (!walkIn) {
            walkIn = await client.customer.create({
                data: {
                    name: 'Walk-in Customer',
                    phone: '0000000000',
                    isWalkIn: true,
                    storeId,
                },
            });
        }
        return walkIn;
    }

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
                const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : Number(product.gstRate);
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
            const paidAmount = data.paidAmount !== undefined ? Number(data.paidAmount) : totalAmount;
            const discount = Number(data.discount || 0);

            // Determine Customer (Assign Walk-in if not provided)
            let actualCustomerId = data.customerId;
            if (!actualCustomerId) {
                const walkIn = await this.getOrCreateWalkInCustomer(data.storeId, tx);
                actualCustomerId = walkIn.id;
            }

            const customer = await tx.customer.findUnique({
                where: { id: actualCustomerId },
            });

            if (!customer) {
                throw { statusCode: 404, message: 'Customer not found' };
            }

            // Create sale
            const sale = await tx.sale.create({
                data: {
                    invoiceNumber: generateInvoiceNumber('INV'),
                    storeId: data.storeId,
                    customerId: actualCustomerId,
                    soldById: userId,
                    subtotal,
                    taxAmount: totalTax,
                    discount,
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
                    customer: { select: { id: true, name: true, isWalkIn: true } },
                    soldBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            // ─── LEDGER & BALANCE UPDATES ────────────────────────
            let currentBalance = Number(customer.balance);

            // 1. Record the full Sale amount as a CREDIT (they owe us for the invoice)
            currentBalance += totalAmount;

            await tx.ledgerEntry.create({
                data: {
                    customerId: actualCustomerId,
                    saleId: sale.id,
                    type: 'CREDIT',
                    amount: totalAmount,
                    paymentMethod: 'CREDIT',
                    description: `Invoice ${sale.invoiceNumber} (Total Amount)`,
                    balanceAfter: currentBalance,
                    recordedById: userId,
                },
            });

            // 2. Record the payment as a DEBIT (they paid some or all)
            if (paidAmount > 0) {
                currentBalance -= paidAmount;

                await tx.ledgerEntry.create({
                    data: {
                        customerId: actualCustomerId,
                        saleId: sale.id,
                        type: 'DEBIT',
                        amount: paidAmount,
                        paymentMethod: data.paymentMethod || 'CASH',
                        description: `Payment for Invoice ${sale.invoiceNumber}`,
                        balanceAfter: currentBalance,
                        recordedById: userId,
                    },
                });
            }

            // 3. Final Balance Update
            await tx.customer.update({
                where: { id: actualCustomerId },
                data: { balance: currentBalance },
            });

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
            // FIX: Using AppError instead of plain object so stack traces are preserved
            throw new AppError('Sale not found', 404);
        }

        return sale;
    }

    /**
     * FIX: Update sale status (RETURNED / PARTIAL_RETURN).
     * Previously there was no API endpoint to change a sale's status despite
     * RETURNED and PARTIAL_RETURN existing in the SaleStatus enum.
     * When a sale is marked RETURNED, stock is added back to inventory.
     */
    async updateStatus(id, data, user) {
        const { status, notes } = data;
        const allowedStatuses = ['COMPLETED', 'RETURNED', 'PARTIAL_RETURN'];
        if (!allowedStatuses.includes(status)) {
            throw new AppError(`Invalid status: ${status}`, 400);
        }

        return prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findUnique({
                where: { id },
                include: { items: true }
            });
            if (!sale) throw new AppError('Sale not found', 404);

            const updated = await tx.sale.update({
                where: { id },
                data: { status, notes: notes || sale.notes }
            });

            // If the sale is being returned, add stock back to inventory
            if (status === 'RETURNED') {
                for (const item of sale.items) {
                    const inv = await tx.inventory.findFirst({
                        where: { productId: item.productId, storeId: sale.storeId }
                    });
                    if (inv) {
                        await tx.inventory.update({
                            where: { id: inv.id },
                            data: { quantity: { increment: item.quantity } }
                        });
                    }
                }
            }

            return updated;
        });
    }
}

export default new SaleService();
