// ============================================
// Sale Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, generateInvoiceNumber } from '../utils/helpers.js';
// FIX: Import AppError so we get proper stack traces on thrown errors
import { AppError } from '../utils/AppError.js';
import creditScoreService from './creditScoreService.js';

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
        // ── IDEMPOTENCY CHECK ──────────────────────────────────────────
        // If the client sent a clientId (assigned when creating the request offline),
        // check whether this sale was already processed (e.g., sync retried after reconnect).
        if (data.clientId) {
            const existing = await prisma.sale.findUnique({
                where: { clientId: data.clientId },
            });
            if (existing) {
                console.log(`[saleService] Duplicate clientId detected: ${data.clientId} — returning existing sale`);
                return existing;
            }
        }

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
                    throw new AppError(`Product not found: ${item.productId}`, 404);
                }

                // Check stock
                const totalStock = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
                if (totalStock < item.quantity) {
                    throw new AppError(
                        `Insufficient stock for ${product.name}. Available: ${totalStock}, Requested: ${item.quantity}`,
                        400
                    );
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
                throw new AppError('Customer not found', 404);
            }

            // Create sale
            const sale = await tx.sale.create({
                data: {
                    clientId: data.clientId || null,
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
                    dueDate: data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Default 15 days
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

            // Trigger credit score calculation (Async, don't block response)
            creditScoreService.calculateAndSaveScore(actualCustomerId);

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
     * Update sale status (RETURNED / PARTIAL_RETURN).
     * When a sale is returned:
     *   1. Stock is restored to inventory for returned items.
     *   2. A DEBIT ledger entry is created to reduce the customer's khata balance.
     *   3. The customer's balance field is updated accordingly.
     */
    async updateStatus(id, data, user) {
        const { status, notes, returnedItemIds } = data;
        const allowedStatuses = ['COMPLETED', 'RETURNED', 'PARTIAL_RETURN'];
        if (!allowedStatuses.includes(status)) {
            throw new AppError(`Invalid status: ${status}`, 400);
        }

        return prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findUnique({
                where: { id },
                include: {
                    items: true,
                    customer: true,
                }
            });
            if (!sale) throw new AppError('Sale not found', 404);

            const updated = await tx.sale.update({
                where: { id },
                data: { status, notes: notes || sale.notes }
            });

            // Determine which items are being returned
            // For RETURNED: all items. For PARTIAL_RETURN: only the selected ones.
            const itemsToReturn = (status === 'RETURNED' || !returnedItemIds || returnedItemIds.length === 0)
                ? sale.items
                : sale.items.filter(item => returnedItemIds.includes(item.id));

            if (itemsToReturn.length === 0) return updated;

            // 1. Restore stock for returned items AND mark them as returned
            for (const item of itemsToReturn) {
                const inv = await tx.inventory.findFirst({
                    where: { productId: item.productId, storeId: sale.storeId }
                });
                if (inv) {
                    await tx.inventory.update({
                        where: { id: inv.id },
                        data: { quantity: { increment: item.quantity } }
                    });
                }
                // Mark the sale item as returned so the invoice viewer can show it
                await tx.saleItem.update({
                    where: { id: item.id },
                    data: { returned: true }
                });
            }

            // 2. Calculate the amount being returned
            const returnedAmount = itemsToReturn.reduce((sum, item) => sum + Number(item.total || 0), 0);

            if (returnedAmount > 0 && sale.customerId) {
                const customer = sale.customer;
                const currentBalance = Number(customer?.balance || 0);
                const newBalance = currentBalance - returnedAmount;

                // 3. Create a DEBIT ledger entry (reduces what customer owes)
                await tx.ledgerEntry.create({
                    data: {
                        customerId: sale.customerId,
                        saleId: sale.id,
                        type: 'DEBIT',
                        amount: returnedAmount,
                        paymentMethod: 'CASH',
                        description: `[RETURN] Invoice ${sale.invoiceNumber} — ${itemsToReturn.length} item${itemsToReturn.length > 1 ? 's' : ''} returned`,
                        balanceAfter: newBalance,
                        recordedById: user?.id || null,
                    }
                });

                // 4. Update customer balance
                await tx.customer.update({
                    where: { id: sale.customerId },
                    data: { balance: newBalance }
                });

                // Recalculate credit score async (non-blocking)
                creditScoreService.calculateAndSaveScore(sale.customerId).catch(() => {});
            }

            return updated;
        });
    }
}

export default new SaleService();
