// ============================================
// Transaction Service (Unified Entry Console)
// ============================================

import prisma from '../config/database.js';
import { generateInvoiceNumber } from '../utils/helpers.js';
import { AppError } from '../utils/AppError.js';

class TransactionService {
    /**
     * Entry point for unified transaction recording.
     * Handles: SALE, PURCHASE, EXPENSE, PAYMENT, MISC
     */
    async create(data, user) {
        const { type, options = {} } = data;

        // FIX: Security — storeId must come exclusively from the authenticated user
        // for store-level users. A STORE_USER was previously able to pass any storeId
        // in the request body and it would be used directly if user.storeId was null.
        // Now STORE_USERs are always locked to their assigned store.
        const storeId = user.role === 'ADMIN'
            ? (user.storeId || data.storeId)  // Admins may specify any store
            : user.storeId;                    // STORE_USERs locked to their own store

        if (!storeId) {
            throw new AppError('No store assigned. Cannot create transaction.', 400);
        }

        // Auto-approval: Admins are auto-approved; staff entries require review
        const isApproved = user.role === 'ADMIN';

        // Attach validated storeId back to data so sub-handlers can use it
        const safeData = { ...data, storeId };

        return prisma.$transaction(async (tx) => {
            let result;

            if (type === 'SALE') {
                result = await this.processSale(safeData, user, isApproved, tx);
            } else if (type === 'PURCHASE') {
                result = await this.processPurchase(safeData, user, isApproved, tx);
            } else if (type === 'EXPENSE') {
                result = await this.processExpense(safeData, user, tx);
            } else if (type === 'PAYMENT') {
                result = await this.processPayment(safeData, user, tx);
            } else if (type === 'MISC') {
                // FIX: MISC type was shown in the UI but always returned 400.
                // Now it records as an expense with category 'MISC' so that
                // it is stored and visible in expense reports.
                result = await this.processExpense(
                    { ...safeData, category: safeData.category || 'MISC', amount: safeData.paidAmount || safeData.amount || 0 },
                    user,
                    tx
                );
            } else {
                throw new AppError(`Invalid entry type: ${type}`, 400);
            }

            // Create initial audit log for creation
            await tx.auditLog.create({
                data: {
                    entityType: type,
                    entityId: result.id,
                    action: 'CREATE',
                    newValue: JSON.parse(JSON.stringify(result)),
                    changedById: user.id,
                    status: isApproved ? 'APPROVED' : 'PENDING',
                    approvedById: isApproved ? user.id : null,
                    notes: `Initial ${type} entry recorded`,
                }
            });

            return result;
        });
    }

    /**
     * Process Sale Entry with automatic totals and optional auto-actions
     */
    async processSale(data, user, isApproved, tx) {
        const { items, customerId, options = {} } = data;
        let subtotal = 0;
        let totalTax = 0;
        const saleItems = [];

        // 1. Process Items & Calculate Totals
        for (const item of items) {
            const product = await tx.product.findUnique({
                where: { id: item.productId }
            });

            if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

            const itemSubtotal = (item.quantity * item.unitPrice) - (item.discount || 0);
            const gstAmount = (itemSubtotal * (item.gstRate || Number(product.gstRate))) / 100;

            subtotal += itemSubtotal;
            totalTax += gstAmount;

            saleItems.push({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                gstRate: item.gstRate || Number(product.gstRate),
                gstAmount,
                discount: item.discount || 0,
                total: itemSubtotal + gstAmount,
                sourceInventoryId: item.sourceInventoryId || null,
            });

            // AUTO-ACTION: Update Stock (if selected)
            if (options.updateStock) {
                await this.deductStock(item, data.storeId, tx);
            }
        }

        const totalAmount = subtotal + totalTax - (data.discount || 0);

        // 3. Create Sale Record
        const sale = await tx.sale.create({
            data: {
                invoiceNumber: data.invoiceNumber || generateInvoiceNumber('INV'),
                storeId: data.storeId,
                customerId: customerId || null,
                soldById: user.id,
                subtotal,
                taxAmount: totalTax,
                discount: data.discount || 0,
                totalAmount,
                paidAmount: data.paidAmount || 0,
                paymentMethod: data.paymentMethod || 'CASH',
                notes: data.notes,
                expectedDeliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
                subCategory: data.subCategory,
                isApproved,
                items: { create: saleItems }
            }
        });

        // 4. AUTO-ACTION: Update Loan/Ledger (if selected)
        if (options.updateLoan && customerId) {
            await this.updateCustomerLedger(sale, data.paidAmount, user.id, tx);
        }

        return sale;
    }

    /**
     * Process Purchase Entry
     */
    async processPurchase(data, user, isApproved, tx) {
        const { items, supplierId, options = {} } = data;
        let subtotal = 0;
        let totalTax = 0;
        const purchaseItems = [];

        for (const item of items) {
            const itemSubtotal = item.quantity * item.unitPrice;
            const gstAmount = (itemSubtotal * (item.gstRate || 0)) / 100;

            subtotal += itemSubtotal;
            totalTax += gstAmount;

            purchaseItems.push({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                gstRate: item.gstRate || 0,
                gstAmount,
                total: itemSubtotal + gstAmount
            });

            // AUTO-ACTION: Update Stock
            if (options.updateStock) {
                await this.increaseStock(item, data.storeId, tx);
            }
        }

        return tx.purchase.create({
            data: {
                invoiceNumber: data.invoiceNumber || generateInvoiceNumber('PUR'),
                storeId: data.storeId,
                supplierId: supplierId,
                createdById: user.id,
                subtotal,
                taxAmount: totalTax,
                totalAmount: subtotal + totalTax,
                paidAmount: data.paidAmount || 0,
                notes: data.notes,
                isApproved,
                items: { create: purchaseItems }
            }
        });
    }

    /**
     * Process Expense Entry
     */
    async processExpense(data, user, tx) {
        if (!data.amount && !data.paidAmount) {
            throw new AppError('Amount is required for an expense entry', 400);
        }
        return tx.expense.create({
            data: {
                category: data.category || 'General',
                amount: data.amount || data.paidAmount,
                description: data.description || data.notes,
                paymentMethod: data.paymentMethod || 'CASH',
                storeId: data.storeId,
                recordedById: user.id,
                date: data.date ? new Date(data.date) : new Date()
            }
        });
    }

    /**
     * Process standalone Payment Entry (Updating Khata without a Sale)
     */
    async processPayment(data, user, tx) {
        if (!data.customerId) {
            throw new AppError('customerId is required for a PAYMENT entry', 400);
        }
        const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
        if (!customer) {
            throw new AppError('Customer not found', 404);
        }
        const amount = Number(data.paidAmount || data.amount);
        if (!amount || amount <= 0) {
            throw new AppError('A positive amount is required for a payment entry', 400);
        }
        // DEBIT/Payment decreases the customer's outstanding balance
        const newBalance = Number(customer.balance) - amount;

        await tx.customer.update({
            where: { id: data.customerId },
            data: { balance: newBalance }
        });

        return tx.ledgerEntry.create({
            data: {
                customerId: data.customerId,
                type: 'DEBIT',
                amount: amount,
                paymentMethod: data.paymentMethod || 'CASH',
                description: data.notes || 'Payment Received',
                balanceAfter: newBalance,
                recordedById: user.id
            }
        });
    }

    // ── Helper: Deduct Stock (FIFO or Manual Batch Select) ──
    async deductStock(item, storeId, tx) {
        let remaining = item.quantity;

        // Use manually chosen batch if provided
        if (item.sourceInventoryId) {
            const inv = await tx.inventory.findUnique({ where: { id: item.sourceInventoryId } });
            if (!inv || inv.quantity < remaining) {
                throw new AppError(`Insufficient stock in selected batch for product ${item.productId}`, 400);
            }
            await tx.inventory.update({
                where: { id: item.sourceInventoryId },
                data: { quantity: { decrement: remaining } }
            });
            return;
        }

        // Fallback: FIFO across all batches
        const inventory = await tx.inventory.findMany({
            where: { productId: item.productId, storeId },
            orderBy: { createdAt: 'asc' }
        });

        for (const inv of inventory) {
            if (remaining <= 0) break;
            const take = Math.min(inv.quantity, remaining);
            await tx.inventory.update({
                where: { id: inv.id },
                data: { quantity: { decrement: take } }
            });
            remaining -= take;
        }

        // If we still have remaining after all batches, stock is insufficient
        if (remaining > 0) {
            throw new AppError(`Insufficient total stock for product ${item.productId}`, 400);
        }
    }

    // ── Helper: Increase Stock on Purchase ──
    async increaseStock(item, storeId, tx) {
        const existing = await tx.inventory.findFirst({
            where: { productId: item.productId, storeId }
        });

        if (existing) {
            await tx.inventory.update({
                where: { id: existing.id },
                data: { quantity: { increment: item.quantity } }
            });
        } else {
            await tx.inventory.create({
                data: {
                    productId: item.productId,
                    storeId,
                    quantity: item.quantity,
                    minStockLevel: 10
                }
            });
        }
    }

    // ── Helper: Update Customer Ledger after Sale ──
    async updateCustomerLedger(sale, paidAmount, userId, tx) {
        const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        let balance = Number(customer.balance) + Number(sale.totalAmount);

        // Record Credit (The Invoice — customer now owes this amount)
        await tx.ledgerEntry.create({
            data: {
                customerId: sale.customerId,
                saleId: sale.id,
                type: 'CREDIT',
                amount: sale.totalAmount,
                description: `Invoice ${sale.invoiceNumber}`,
                balanceAfter: balance,
                recordedById: userId
            }
        });

        // Record Debit (The upfront Payment — reduces what they owe)
        if (paidAmount > 0) {
            balance -= Number(paidAmount);
            await tx.ledgerEntry.create({
                data: {
                    customerId: sale.customerId,
                    saleId: sale.id,
                    type: 'DEBIT',
                    amount: paidAmount,
                    description: `Payment for INV ${sale.invoiceNumber}`,
                    balanceAfter: balance,
                    recordedById: userId
                }
            });
        }

        await tx.customer.update({
            where: { id: sale.customerId },
            data: { balance }
        });
    }

    /**
     * Update an entry with Approval Workflow.
     * STAFF → Creates a 'PENDING' audit log. Original data is NOT changed.
     * ADMIN → Updates the data directly and logs as 'APPROVED'.
     */
    async update(type, id, data, user) {
        const isAdmin = user.role === 'ADMIN';
        const model = type.toLowerCase();

        // Validate that the model name is one of our known allowed types
        // to prevent arbitrary Prisma model access
        const allowedModels = ['sale', 'purchase', 'expense'];
        if (!allowedModels.includes(model)) {
            throw new AppError(`Update not supported for type: ${type}`, 400);
        }

        // Fetch current values for 'before' snapshot
        const original = await prisma[model].findUnique({
            where: { id },
            include: (type === 'SALE' || type === 'PURCHASE') ? { items: true } : {}
        });

        if (!original) throw new AppError(`${type} not found`, 404);

        if (!isAdmin) {
            // Staff: Create a request for approval — original record is NOT touched
            return prisma.auditLog.create({
                data: {
                    entityType: type,
                    entityId: id,
                    action: 'UPDATE',
                    oldValue: JSON.parse(JSON.stringify(original)),
                    newValue: data,
                    changedById: user.id,
                    status: 'PENDING',
                    notes: `Edit request by staff ${user.firstName}`,
                }
            });
        }

        // Admin: Direct Update with full audit trail
        return prisma.$transaction(async (tx) => {
            const updated = await tx[model].update({
                where: { id },
                data: this.formatUpdateData(type, data)
            });

            // FIX: If the update changes item quantities on a SALE or PURCHASE,
            // we need to adjust inventory. We compute the delta and correct stock.
            // This only applies when items are included in the update data.
            if ((type === 'SALE' || type === 'PURCHASE') && data.items && original.items) {
                await this.reconcileInventoryAfterEdit(type, original.items, data.items, original.storeId, tx);
            }

            await tx.auditLog.create({
                data: {
                    entityType: type,
                    entityId: id,
                    action: 'UPDATE',
                    oldValue: JSON.parse(JSON.stringify(original)),
                    newValue: JSON.parse(JSON.stringify(updated)),
                    changedById: user.id,
                    status: 'APPROVED',
                    approvedById: user.id,
                    notes: 'Admin direct edit',
                }
            });

            return updated;
        });
    }

    /**
     * Admin rejects a pending edit request
     * FIX: The reject flow was completely missing — audit logs could only be
     * approved, leaving the REJECTED status code unused and admins unable
     * to dismiss bad edit requests.
     */
    async rejectUpdate(logId, adminId, notes = '') {
        const log = await prisma.auditLog.findUnique({ where: { id: logId } });
        if (!log || log.status !== 'PENDING') {
            throw new AppError('Log not found or already processed', 400);
        }

        return prisma.auditLog.update({
            where: { id: logId },
            data: {
                status: 'REJECTED',
                approvedById: adminId,
                notes: notes || 'Edit request rejected by administrator',
            }
        });
    }

    /**
     * FIX: When an admin approves a staff edit that changes item quantities,
     * the inventory must be adjusted accordingly.
     * Previous bug: only the record fields were updated, but stock levels
     * were never corrected — causing inventory discrepancies.
     */
    async reconcileInventoryAfterEdit(type, originalItems, newItems, storeId, tx) {
        // Build a map of productId -> quantity change
        const originalMap = {};
        for (const item of originalItems) {
            originalMap[item.productId] = (originalMap[item.productId] || 0) + item.quantity;
        }
        const newMap = {};
        for (const item of newItems) {
            newMap[item.productId] = (newMap[item.productId] || 0) + (item.quantity || 0);
        }

        // Process each product's delta
        const allProductIds = new Set([...Object.keys(originalMap), ...Object.keys(newMap)]);
        for (const productId of allProductIds) {
            const original = originalMap[productId] || 0;
            const updated = newMap[productId] || 0;
            const delta = updated - original; // positive = more qty needed; negative = fewer

            if (delta === 0) continue;

            const inv = await tx.inventory.findFirst({ where: { productId, storeId } });
            if (!inv) continue;

            if (type === 'SALE') {
                // Sales deduct stock; more items = more deduction needed (decrement)
                // fewer items = stock should be returned (increment)
                await tx.inventory.update({
                    where: { id: inv.id },
                    data: { quantity: { decrement: delta } } // negative delta → increment
                });
            } else if (type === 'PURCHASE') {
                // Purchases add stock; delta direction is opposite
                await tx.inventory.update({
                    where: { id: inv.id },
                    data: { quantity: { increment: delta } }
                });
            }
        }
    }

    /**
     * Admin approves a pending edit request
     */
    async approveUpdate(logId, adminId) {
        return prisma.$transaction(async (tx) => {
            const log = await tx.auditLog.findUnique({ where: { id: logId } });
            if (!log || log.status !== 'PENDING') {
                throw new AppError('Invalid or already processed log', 400);
            }

            const model = log.entityType.toLowerCase();

            // Apply the approved new values to the actual record
            const updated = await tx[model].update({
                where: { id: log.entityId },
                data: this.formatUpdateData(log.entityType, log.newValue)
            });

            // FIX: Reconcile inventory after an approved edit on SALE/PURCHASE
            if ((log.entityType === 'SALE' || log.entityType === 'PURCHASE') && log.newValue?.items) {
                const original = await tx[model].findUnique({
                    where: { id: log.entityId },
                    include: { items: true }
                });
                if (original) {
                    await this.reconcileInventoryAfterEdit(
                        log.entityType,
                        JSON.parse(JSON.stringify(log.oldValue?.items || [])),
                        log.newValue.items,
                        original.storeId,
                        tx
                    );
                }
            }

            // Update log status
            await tx.auditLog.update({
                where: { id: logId },
                data: {
                    status: 'APPROVED',
                    approvedById: adminId,
                    notes: 'Changes approved and applied by administrator'
                }
            });

            return updated;
        });
    }

    // Helper to format data for specific model updates (strips non-updatable fields)
    formatUpdateData(type, data) {
        const { id, storeId, createdAt, updatedAt, items, ...fields } = data;
        return fields;
    }

    /**
     * Get transaction history (Audit Logs)
     */
    async getHistory(type, id) {
        return prisma.auditLog.findMany({
            where: { entityType: type, entityId: id },
            include: {
                changedBy: { select: { firstName: true, lastName: true } },
                approvedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Get all pending audit logs (for admin approvals dashboard)
     * FIX: This was missing entirely — admins had no way to see what
     * edits were awaiting their approval.
     */
    async getPendingApprovals(storeId = null) {
        return prisma.auditLog.findMany({
            where: {
                status: 'PENDING',
                action: 'UPDATE',
            },
            include: {
                changedBy: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'asc' }
        });
    }
}

export default new TransactionService();
