
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding Credit Score data...');

  // 1. Find or create a Store
  let store = await prisma.store.findFirst();
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: 'Vyaparisetu Main Store',
        address: '123 ERP Street',
        city: 'Mumbai',
        phone: '9876543210'
      }
    });
  }

  // 2. Find a User to be the "seller"
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'seed@example.com',
        firstName: 'Seed',
        lastName: 'User',
        password: 'password123',
        role: 'ADMIN',
        storeId: store.id
      }
    });
  }

  // 3. Define sample customers
  const customersData = [
    {
      name: 'Aditya (Trusted)',
      phone: '9000000001',
      balance: 0,
      creditLimit: 50000,
      creditScore: 92,
      creditCategory: 'Trusted',
      storeId: store.id
    },
    {
      name: 'Rahul (Average)',
      phone: '9000000002',
      balance: 15400,
      creditLimit: 30000,
      creditScore: 68,
      creditCategory: 'Average',
      storeId: store.id
    },
    {
      name: 'Suresh (Risky)',
      phone: '9000000003',
      balance: 42000,
      creditLimit: 40000,
      creditScore: 35,
      creditCategory: 'Risky',
      storeId: store.id
    }
  ];

  // 4. Clear existing test data to avoid duplicates/errors
  const phones = customersData.map(c => c.phone);
  await prisma.customer.deleteMany({
    where: { phone: { in: phones } }
  });

  for (const c of customersData) {
    const customer = await prisma.customer.create({
      data: {
          ...c,
          balance: Number(c.balance),
          creditLimit: Number(c.creditLimit)
      }
    });
    console.log(`✅ Created: ${customer.name} -> Score: ${customer.creditScore} (${customer.creditCategory})`);
    
    // Create one pending sale (status: COMPLETED but paidAmount: 0) for the risky customer
    if (c.creditCategory === 'Risky') {
       await prisma.sale.create({
        data: {
          customerId: customer.id,
          subtotal: 40000,
          taxAmount: 2000,
          totalAmount: 42000,
          paidAmount: 0,
          status: 'COMPLETED',
          soldById: user.id,
          invoiceNumber: `INV-RSK-${Math.floor(Math.random() * 1000000)}`,
          storeId: store.id,
          dueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days overdue
        }
      });
    }
  }

  console.log('✨ Seeding complete! Refresh your browser to see the data.');
}

main()
  .catch(e => {
    console.error('❌ Seeding failed with error:');
    console.dir(e, { depth: null });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
