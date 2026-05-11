// ============================================
// Migration Script: Walk-in Customers & Ledger
// Use this to fix legacy data for stores
// ============================================

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function migrate() {
    console.log('🚀 Starting Walk-in Customer Migration...');

    const stores = await prisma.store.findMany();

    for (const store of stores) {
        console.log(`\nProcessing Store: ${store.name}`);

        // 1. Ensure Walk-in Customer exists
        let walkIn = await prisma.customer.findFirst({
            where: { storeId: store.id, isWalkIn: true },
        });

        if (!walkIn) {
            walkIn = await prisma.customer.create({
                data: {
                    name: 'Walk-in Customer',
                    phone: '0000000000',
                    isWalkIn: true,
                    storeId: store.id,
                },
            });
            console.log(`✅ Created Walk-in Customer for ${store.name}`);
        } else {
            console.log(`ℹ️ Walk-in Customer already exists for ${store.name}`);
        }

        // 2. Assign Walk-in to sales with no customer
        const orphanSales = await prisma.sale.updateMany({
            where: { storeId: store.id, customerId: null },
            data: { customerId: walkIn.id },
        });
        console.log(`✅ Updated ${orphanSales.count} orphan sales.`);

        // 3. Create missing Ledger entries for existing sales
        const sales = await prisma.sale.findMany({
            where: { storeId: store.id },
            include: { ledgerEntries: true },
        });

        let entriesCreated = 0;
        for (const sale of sales) {
            if (sale.ledgerEntries.length === 0) {
                // This sale has no ledger entries, create them now
                const total = Number(sale.totalAmount);
                const paid = Number(sale.paidAmount);

                // We assume balanceAfter as the impact of this sale only for migration accuracy
                // In production, the service handles running totals

                // Credit (Invoice)
                await prisma.ledgerEntry.create({
                    data: {
                        customerId: sale.customerId,
                        saleId: sale.id,
                        type: 'CREDIT',
                        amount: total,
                        paymentMethod: 'CREDIT',
                        description: `Migration: Invoice ${sale.invoiceNumber}`,
                        balanceAfter: total, // Simplified for migration
                        recordedById: sale.soldById,
                    }
                });

                // Debit (Payment)
                if (paid > 0) {
                    await prisma.ledgerEntry.create({
                        data: {
                            customerId: sale.customerId,
                            saleId: sale.id,
                            type: 'DEBIT',
                            amount: paid,
                            paymentMethod: sale.paymentMethod,
                            description: `Migration: Payment for ${sale.invoiceNumber}`,
                            balanceAfter: total - paid,
                            recordedById: sale.soldById,
                        }
                    });
                }
                entriesCreated++;
            }
        }
        console.log(`✅ Created ledger records for ${entriesCreated} sales.`);
    }

    console.log('\n✨ Migration complete!');
}

migrate()
    .catch(err => console.error('❌ Migration failed:', err))
    .finally(() => prisma.$disconnect());
