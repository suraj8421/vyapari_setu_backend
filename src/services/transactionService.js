// ============================================
// Transaction Service (Unified Entry Console)
// ============================================

import prisma from '../config/database.js';
import { generateInvoiceNumber } from '../utils/helpers.js';

class TransactionService {
    /**
     * Entry point for unified transaction recording
     * Handles: SALE, PURCHASE, EXPENSE, PAYMENT, MISC
     */
    async create(data, user) {
        const { type, options = {} } = data;
        const storeId = user.storeId || data.storeId;
        const isAdmin = user.role === 'ADMIN';

        // Auto-approval logic: Admins are auto-approved, staff entries might need review
        const isApproved = isAdmin;

        return prisma.$transaction(async (tx) => {
            let result;

            if (type === 'SALE') {
                result = await this.processSale(data, user, isApproved, tx);
            } else if (type === 'PURCHASE') {
                result = await this.processPurchase(data, user, isApproved, tx);
            } else if (type === 'EXPENSE') {
                result = await this.processExpense(data, user, tx);
            } else if (type === 'PAYMENT') {
                result = await this.processPayment(data, user, tx);
            } else {
                throw { statusCode: 400, message: 'Invalid entry type' };
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
     * Process Sale Entry with optional auto-actions
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

            if (!product) throw { statusCode: 404, message: `Product ${item.productId} not found` };

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
                // Optional: Manual Batch Selection
                sourceInventoryId: item.sourceInventoryId || null,
            });

            // 2. AUTO-ACTION: Update Stock (if selected)
            if (options.updateStock) {
                await this.deductStock(item, data.storeId, tx);
            }
        }

        const totalAmount = subtotal + totalTax - (data.discount || 0);

        // 3. Create Sale Record
        const sale = await tx.sale.create({
            data: {
                invoiceNumber: data.invoiceNumber || `INV-${Date.now()}`,
                storeId: data.storeId,
                customerId: customerId,
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
                invoiceNumber: data.invoiceNumber || `PUR-${Date.now()}`,
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
        return tx.expense.create({
            data: {
                category: data.category,
                amount: data.amount,
                description: data.description,
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
        const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
        const amount = Number(data.amount);
        const newBalance = Number(customer.balance) - amount; // Assuming Debit/Payment decreases balance

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

    // Helper: Deduct Stock (FIFO or Manual)
    async deductStock(item, storeId, tx) {
        let remaining = item.quantity;

        // Use manual batch if selected
        if (item.sourceInventoryId) {
            await tx.inventory.update({
                where: { id: item.sourceInventoryId },
                data: { quantity: { decrement: remaining } }
            });
            return;
        }

        // Fallback to FIFO
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
    }

    // Helper: Increase Stock
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

    // Helper: Update Customer Ledger
    async updateCustomerLedger(sale, paidAmount, userId, tx) {
        const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        let balance = Number(customer.balance) + Number(sale.totalAmount);

        // Record Credit (The Invoice)
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

        // Record Debit (The Payment)
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
     * Update an entry with Approval Workflow
     * STAFF: Creates a 'PENDING' audit log. Original data is NOT changed.
     * ADMIN: Updates the data directly and logs as 'APPROVED'.
     */
    async update(type, id, data, user) {
        const isAdmin = user.role === 'ADMIN';
        const storeId = user.storeId;

        // Fetch current values for 'before' snapshot
        const model = type.toLowerCase();
        const original = await prisma[model].findUnique({
            where: { id },
            include: type === 'SALE' || type === 'PURCHASE' ? { items: true } : {}
        });

        if (!original) throw { statusCode: 404, message: `${type} not found` };

        if (!isAdmin) {
            // Logic for STAFF: Create a request for approval
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

        // Logic for ADMIN: Direct Update
        return prisma.$transaction(async (tx) => {
            const updated = await tx[model].update({
                where: { id },
                data: this.formatUpdateData(type, data)
            });

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

    // Helper to format data for specific model updates
    formatUpdateData(type, data) {
        // Exclude relations and metadata that shouldn't be updated directly
        const { id, storeId, createdAt, updatedAt, items, ...fields } = data;
        return fields;
    }

    /**
     * Admin approves a pending edit request
     */
    async approveUpdate(logId, adminId) {
        return prisma.$transaction(async (tx) => {
            const log = await tx.auditLog.findUnique({ where: { id: logId } });
            if (!log || log.status !== 'PENDING') throw { statusCode: 400, message: 'Invalid or processed log' };

            const model = log.entityType.toLowerCase();

            // Apply the new values to the actual record
            const updated = await tx[model].update({
                where: { id: log.entityId },
                data: this.formatUpdateData(log.entityType, log.newValue)
            });

            // Update log status
            await tx.auditLog.update({
                where: { id: logId },
                data: {
                    status: 'APPROVED',
                    approvedById: adminId,
                    notes: 'Changes approved by administrator'
                }
            });

            return updated;
        });
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
}

export default new TransactionService();
