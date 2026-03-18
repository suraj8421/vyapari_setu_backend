import prisma from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import { generateInvoiceNumber } from '../utils/helpers.js';
import approvalNotificationService from './approvalNotificationService.js';

class B2bInvoiceService {
    /**
     * Seller creates an invoice for a connected buyer
     */
    async createInvoice(sellerStoreId, data, userId, io) {
        const { buyerStoreId, items, notes } = data;

        // Verify connection
        const connection = await prisma.storeConnection.findUnique({
            where: {
                supplierStoreId_buyerStoreId: {
                    supplierStoreId: sellerStoreId,
                    buyerStoreId: buyerStoreId
                }
            }
        });

        if (!connection || connection.status !== 'ACCEPTED') {
            throw new AppError("You do not have an active connection with this store", 403);
        }

        let totalAmount = 0;
        const invoiceItems = [];

        for (const item of items) {
            // Verify product belongs to seller
            const product = await prisma.product.findFirst({
                where: { id: item.productId, storeId: sellerStoreId }
            });
            if (!product) throw new AppError(`Product ${item.productId} not found or unauthorized`, 404);

            const itemSubtotal = item.price * item.quantity;
            const gstAmount = (itemSubtotal * (item.gst || 0)) / 100;
            const itemTotal = itemSubtotal + gstAmount;

            totalAmount += itemTotal;

            invoiceItems.push({
                productId: product.id,
                quantity: item.quantity,
                price: item.price,
                gst: item.gst || 0,
                total: itemTotal
            });
        }

        const invoice = await prisma.storeInvoice.create({
            data: {
                sellerStoreId,
                buyerStoreId,
                totalAmount,
                notes,
                status: 'PENDING_CONFIRMATION',
                items: { create: invoiceItems }
            },
            include: { items: { include: { product: true } }, sellerStore: true }
        });

        // Create unified ApprovalNotification for the buyer store
        // Pass io so the bell badge fires in real-time
        await approvalNotificationService.create({
            storeId: buyerStoreId,
            type: 'B2B_INVOICE_REQUEST',
            title: 'Invoice Confirmation Request',
            message: `${invoice.sellerStore.name} sent you an invoice of ₹${totalAmount.toFixed(2)}. Please confirm or reject.`,
            referenceId: invoice.id,
            referenceType: 'invoice',
            actionData: {
                sellerName: invoice.sellerStore.name,
                totalAmount,
                itemCount: invoiceItems.length,
            },
        }, io);

        return invoice;
    }

    /**
     * Buyer confirms the invoice, triggering the dual-ledger sync
     */
    async confirmInvoice(invoiceId, buyerStoreId, userId) {
        return prisma.$transaction(async (tx) => {
            const invoice = await tx.storeInvoice.findUnique({
                where: { id: invoiceId },
                include: {
                    items: { include: { product: true } },
                    sellerStore: true,
                    buyerStore: true
                }
            });

            if (!invoice) throw new AppError("Invoice not found", 404);
            if (invoice.buyerStoreId !== buyerStoreId) throw new AppError("Unauthorized", 403);
            if (invoice.status !== 'PENDING_CONFIRMATION' && invoice.status !== 'CORRECTION_REQUESTED') {
                throw new AppError(`Invoice already ${invoice.status}`, 400);
            }

            // 1. Ensure Customer/Supplier mapping exists for local Sales/Purchases
            let customerRecord = await tx.customer.findFirst({
                where: { storeId: invoice.sellerStoreId, phone: invoice.buyerStore.phone || 'B2B' }
            });
            if (!customerRecord) {
                customerRecord = await tx.customer.create({
                    data: {
                        storeId: invoice.sellerStoreId,
                        name: invoice.buyerStore.name,
                        phone: invoice.buyerStore.phone || 'B2B',
                        gstNumber: invoice.buyerStore.gstNumber,
                        isWalkIn: false
                    }
                });
            }

            let supplierRecord = await tx.supplier.findFirst({
                where: { storeId: invoice.buyerStoreId, phone: invoice.sellerStore.phone || 'B2B' }
            });
            if (!supplierRecord) {
                supplierRecord = await tx.supplier.create({
                    data: {
                        storeId: invoice.buyerStoreId,
                        name: invoice.sellerStore.name,
                        phone: invoice.sellerStore.phone || 'B2B',
                        gstNumber: invoice.sellerStore.gstNumber
                    }
                });
            }

            // 2. Create the Sale for the Seller
            const saleInvoiceNum = generateInvoiceNumber('INV');
            const saleItems = invoice.items.map(i => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.price,
                gstRate: i.gst,
                gstAmount: (i.price * i.quantity * i.gst) / 100,
                total: i.total
            }));

            // Calculate Subtotals and Tax for Sale
            let saleSubtotal = 0;
            let saleTax = 0;
            saleItems.forEach(i => {
                saleSubtotal += (i.unitPrice * i.quantity);
                saleTax += i.gstAmount;
            });

            const sale = await tx.sale.create({
                data: {
                    invoiceNumber: saleInvoiceNum,
                    storeId: invoice.sellerStoreId,
                    customerId: customerRecord.id,
                    soldById: userId, // technically authorized by buyer, but recorded globally
                    subtotal: saleSubtotal,
                    taxAmount: saleTax,
                    totalAmount: invoice.totalAmount,
                    paidAmount: 0, // B2B starts unpaid
                    paymentMethod: 'CREDIT',
                    items: { create: saleItems }
                }
            });

            // Seller Ledger & Inventory
            await tx.ledgerEntry.create({
                data: {
                    customerId: customerRecord.id,
                    saleId: sale.id,
                    type: 'CREDIT',
                    amount: invoice.totalAmount,
                    balanceAfter: Number(customerRecord.balance) + Number(invoice.totalAmount),
                    recordedById: userId
                }
            });
            await tx.customer.update({
                where: { id: customerRecord.id },
                data: { balance: { increment: invoice.totalAmount } }
            });

            for (const item of invoice.items) {
                const inv = await tx.inventory.findFirst({
                    where: { storeId: invoice.sellerStoreId, productId: item.productId }
                });
                if (inv) {
                    await tx.inventory.update({
                        where: { id: inv.id },
                        data: { quantity: { decrement: item.quantity } }
                    });
                }
            }

            // 3. Create Purchase for the Buyer
            const purchaseItems = [];
            for (const item of invoice.items) {
                // Match or Create Product in Buyer Store
                let buyerProduct = await tx.product.findFirst({
                    where: { storeId: buyerStoreId, sku: item.product.sku }
                });
                
                if (!buyerProduct) {
                    // Create it if missing so they can track inventory mapping
                    buyerProduct = await tx.product.create({
                        data: {
                            storeId: buyerStoreId,
                            name: item.product.name,
                            sku: item.product.sku + '-B2B', // Prevent strict unique constraints if needed
                            costPrice: item.price,
                            sellingPrice: item.price * 1.2, // Arbitrary markup
                            gstRate: item.gst
                        }
                    });
                }

                purchaseItems.push({
                    productId: buyerProduct.id,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    gstRate: item.gst,
                    gstAmount: (item.price * item.quantity * item.gst) / 100,
                    total: item.total
                });

                // Update Buyer Inventory
                let buyerInv = await tx.inventory.findFirst({
                    where: { storeId: buyerStoreId, productId: buyerProduct.id }
                });
                if (buyerInv) {
                    await tx.inventory.update({
                        where: { id: buyerInv.id },
                        data: { quantity: { increment: item.quantity } }
                    });
                } else {
                    await tx.inventory.create({
                        data: { storeId: buyerStoreId, productId: buyerProduct.id, quantity: item.quantity }
                    });
                }
            }

            const purchase = await tx.purchase.create({
                data: {
                    invoiceNumber: saleInvoiceNum, // Keep synced with seller's sale invoice
                    storeId: buyerStoreId,
                    supplierId: supplierRecord.id,
                    createdById: userId,
                    subtotal: saleSubtotal,
                    taxAmount: saleTax,
                    totalAmount: invoice.totalAmount,
                    paidAmount: 0,
                    status: 'RECEIVED',
                    items: { create: purchaseItems }
                }
            });

            // 4. Update the B2B StoreInvoice Status
            const confirmedInvoice = await tx.storeInvoice.update({
                where: { id: invoiceId },
                data: { status: 'CONFIRMED' }
            });

            // Notify Seller
            const sellerUser = await tx.user.findFirst({ where: { storeId: invoice.sellerStoreId } });
            if (sellerUser) {
                await tx.storeNotification.create({
                    data: {
                        userId: sellerUser.id,
                        type: 'INVOICE_CONFIRMED',
                        message: `${invoice.buyerStore.name} confirmed your invoice.`,
                        relatedInvoiceId: invoice.id
                    }
                });
            }

            return confirmedInvoice;
        });
    }

    /**
     * Buyer rejects the invoice
     */
    async rejectInvoice(invoiceId, buyerStoreId, reason) {
        const invoice = await prisma.storeInvoice.findUnique({ where: { id: invoiceId }, include: { buyerStore: true } });
        if (!invoice || invoice.buyerStoreId !== buyerStoreId) throw new AppError("Unauthorized", 403);

        const updated = await prisma.storeInvoice.update({
            where: { id: invoiceId },
            data: { status: 'REJECTED', rejectionReason: reason }
        });

        const sellerUser = await prisma.user.findFirst({ where: { storeId: invoice.sellerStoreId } });
        if (sellerUser) {
            await prisma.storeNotification.create({
                data: {
                    userId: sellerUser.id,
                    type: 'INVOICE_REJECTED',
                    message: `${invoice.buyerStore.name} rejected your invoice. Reason: ${reason}`,
                    relatedInvoiceId: invoice.id
                }
            });
        }

        return updated;
    }

    /**
     * Buyer requests a correction
     */
    async requestCorrection(invoiceId, buyerStoreId, reason) {
        const invoice = await prisma.storeInvoice.findUnique({ where: { id: invoiceId }, include: { buyerStore: true } });
        if (!invoice || invoice.buyerStoreId !== buyerStoreId) throw new AppError("Unauthorized", 403);

        const updated = await prisma.storeInvoice.update({
            where: { id: invoiceId },
            data: { status: 'CORRECTION_REQUESTED', rejectionReason: reason }
        });

        const sellerUser = await prisma.user.findFirst({ where: { storeId: invoice.sellerStoreId } });
        if (sellerUser) {
            await prisma.storeNotification.create({
                data: {
                    userId: sellerUser.id,
                    type: 'CORRECTION_REQUESTED',
                    message: `${invoice.buyerStore.name} requested a correction on your invoice.`,
                    relatedInvoiceId: invoice.id
                }
            });
        }

        return updated;
    }

    /**
     * Get all pending and past invoices for a store
     */
    async getStoreInvoices(storeId) {
        return await prisma.storeInvoice.findMany({
            where: {
                OR: [{ sellerStoreId: storeId }, { buyerStoreId: storeId }]
            },
            include: {
                sellerStore: { select: { name: true, city: true } },
                buyerStore: { select: { name: true, city: true } },
                items: { include: { product: { select: { name: true } } } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
}

export default new B2bInvoiceService();
