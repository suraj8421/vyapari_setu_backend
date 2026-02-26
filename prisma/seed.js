// ============================================
// Database Seed Script (Prisma v7 / ESM)
// ============================================

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is not set in .env file!');
    process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting seed...');

    // Clean up existing data (in reverse dependency order)
    await prisma.ledgerEntry.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.purchaseItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.user.deleteMany();
    await prisma.store.deleteMany();

    console.log('🗑️  Cleared existing data');

    // ─── Create Stores ───────────────────────────
    const store1 = await prisma.store.create({
        data: {
            name: 'Vyaparisetu Main Store',
            address: '123 Main Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            phone: '022-12345678',
            gstNumber: '27AAACH7409R1ZZ',
        },
    });

    const store2 = await prisma.store.create({
        data: {
            name: 'Vyaparisetu Branch',
            address: '456 Commercial Road',
            city: 'Pune',
            state: 'Maharashtra',
            pincode: '411001',
            phone: '020-87654321',
        },
    });

    console.log('🏪 Created stores');

    // ─── Create Users ────────────────────────────
    const hashedPassword = await bcrypt.hash('admin123', 12);

    const adminUser = await prisma.user.create({
        data: {
            email: 'admin@vyaparisetu.com',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            phone: '9876543210',
            role: 'ADMIN',
            storeId: store1.id,
        },
    });

    const storeUser = await prisma.user.create({
        data: {
            email: 'staff@vyaparisetu.com',
            password: hashedPassword,
            firstName: 'Staff',
            lastName: 'Member',
            phone: '9876543211',
            role: 'STORE_USER',
            storeId: store1.id,
        },
    });

    console.log('👤 Created users');

    // ─── Create Suppliers ────────────────────────
    const supplier1 = await prisma.supplier.create({
        data: {
            name: 'ABC Wholesalers',
            phone: '9876543220',
            email: 'abc@wholesale.com',
            address: 'Wholesale Market, Mumbai',
            gstNumber: '27BBBCH8509R1ZZ',
            storeId: store1.id,
        },
    });

    const supplier2 = await prisma.supplier.create({
        data: {
            name: 'XYZ Traders',
            phone: '9876543221',
            email: 'xyz@traders.com',
            address: 'Trading Hub, Pune',
            storeId: store1.id,
        },
    });

    console.log('🚚 Created suppliers');

    // ─── Create Products ─────────────────────────
    const products = await Promise.all([
        prisma.product.create({
            data: {
                name: 'Toor Dal (1kg)',
                sku: 'DAL-TOOR-1KG',
                barcode: '8901234567890',
                category: 'Pulses',
                unit: 'kg',
                costPrice: 120,
                sellingPrice: 150,
                gstRate: 5,
                hsnCode: '0713',
                storeId: store1.id,
            },
        }),
        prisma.product.create({
            data: {
                name: 'Basmati Rice (5kg)',
                sku: 'RICE-BAS-5KG',
                barcode: '8901234567891',
                category: 'Rice & Grains',
                unit: 'kg',
                costPrice: 350,
                sellingPrice: 450,
                gstRate: 5,
                hsnCode: '1006',
                storeId: store1.id,
            },
        }),
        prisma.product.create({
            data: {
                name: 'Sunflower Oil (1L)',
                sku: 'OIL-SUN-1L',
                barcode: '8901234567892',
                category: 'Edible Oils',
                unit: 'ltr',
                costPrice: 130,
                sellingPrice: 165,
                gstRate: 5,
                hsnCode: '1512',
                storeId: store1.id,
            },
        }),
        prisma.product.create({
            data: {
                name: 'Sugar (1kg)',
                sku: 'SUGAR-1KG',
                barcode: '8901234567893',
                category: 'Sugar & Spices',
                unit: 'kg',
                costPrice: 40,
                sellingPrice: 50,
                gstRate: 5,
                hsnCode: '1701',
                storeId: store1.id,
            },
        }),
        prisma.product.create({
            data: {
                name: 'Colgate Toothpaste (200g)',
                sku: 'ORAL-COL-200',
                barcode: '8901234567894',
                category: 'Personal Care',
                unit: 'pcs',
                costPrice: 90,
                sellingPrice: 110,
                gstRate: 18,
                hsnCode: '3306',
                storeId: store1.id,
            },
        }),
    ]);

    console.log('📦 Created products');

    // ─── Create Inventory ────────────────────────
    await Promise.all(
        products.map((product, index) =>
            prisma.inventory.create({
                data: {
                    productId: product.id,
                    storeId: store1.id,
                    quantity: [50, 30, 25, 100, 40][index],
                    minStockLevel: 10,
                    location: `Shelf ${index + 1}`,
                },
            })
        )
    );

    console.log('📊 Created inventory');

    // ─── Create Customers ────────────────────────
    const customer1 = await prisma.customer.create({
        data: {
            name: 'Ramesh Patel',
            phone: '9876543230',
            email: 'ramesh@example.com',
            address: 'Andheri West, Mumbai',
            creditLimit: 5000,
            balance: 0,
            storeId: store1.id,
        },
    });

    const customer2 = await prisma.customer.create({
        data: {
            name: 'Suresh Sharma',
            phone: '9876543231',
            address: 'Dadar, Mumbai',
            creditLimit: 10000,
            balance: 0,
            storeId: store1.id,
        },
    });

    const customer3 = await prisma.customer.create({
        data: {
            name: 'Geeta Devi',
            phone: '9876543232',
            address: 'Bandra, Mumbai',
            creditLimit: 3000,
            balance: 0,
            storeId: store1.id,
        },
    });

    console.log('🧑‍💼 Created customers');

    // ─── Create a Sample Sale ────────────────────
    const sale1 = await prisma.sale.create({
        data: {
            invoiceNumber: 'INV-20240101-00001',
            storeId: store1.id,
            customerId: customer1.id,
            soldById: storeUser.id,
            subtotal: 600,
            taxAmount: 30,
            discount: 0,
            totalAmount: 630,
            paidAmount: 500,
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            items: {
                create: [
                    {
                        productId: products[0].id,
                        quantity: 2,
                        unitPrice: 150,
                        gstRate: 5,
                        gstAmount: 15,
                        discount: 0,
                        total: 315,
                    },
                    {
                        productId: products[3].id,
                        quantity: 3,
                        unitPrice: 50,
                        gstRate: 5,
                        gstAmount: 7.5,
                        discount: 0,
                        total: 157.5,
                    },
                ],
            },
        },
    });

    // Create ledger entry for credit sale
    const creditAmount = 630 - 500;
    await prisma.customer.update({
        where: { id: customer1.id },
        data: { balance: creditAmount },
    });

    await prisma.ledgerEntry.create({
        data: {
            customerId: customer1.id,
            saleId: sale1.id,
            type: 'CREDIT',
            amount: creditAmount,
            paymentMethod: 'CREDIT',
            description: 'Sale INV-20240101-00001 - Credit',
            balanceAfter: creditAmount,
            recordedById: storeUser.id,
        },
    });

    console.log('💰 Created sample sale with ledger entry');

    // ─── Create a Sample Purchase ────────────────
    await prisma.purchase.create({
        data: {
            invoiceNumber: 'PUR-20240101-00001',
            storeId: store1.id,
            supplierId: supplier1.id,
            createdById: adminUser.id,
            subtotal: 3500,
            taxAmount: 175,
            totalAmount: 3675,
            paidAmount: 3675,
            status: 'RECEIVED',
            items: {
                create: [
                    {
                        productId: products[1].id,
                        quantity: 10,
                        unitPrice: 350,
                        gstRate: 5,
                        gstAmount: 175,
                        total: 3675,
                    },
                ],
            },
        },
    });

    console.log('🛒 Created sample purchase');

    console.log('');
    console.log('✅ Seed completed successfully!');
    console.log('');
    console.log('📋 Login credentials:');
    console.log('   Admin: admin@vyaparisetu.com / admin123');
    console.log('   Staff: staff@vyaparisetu.com / admin123');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
