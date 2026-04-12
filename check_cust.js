import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const customers = await prisma.customer.findMany({ take: 5 });
    console.log('Available Samples:');
    customers.forEach(c => console.log(`- ${c.id} (${c.name})`));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

check();
