
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🧹 Cleaning up customer names...');

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: '(Trusted)' } },
        { name: { contains: '(Average)' } },
        { name: { contains: '(Risky)' } }
      ]
    }
  });

  for (const c of customers) {
    const newName = c.name
      .replace(' (Trusted)', '')
      .replace(' (Average)', '')
      .replace(' (Risky)', '')
      .trim();
    
    await prisma.customer.update({
      where: { id: c.id },
      data: { name: newName }
    });
    console.log(`✅ Fixed: ${c.name} -> ${newName}`);
  }

  console.log('✨ Cleanup complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
