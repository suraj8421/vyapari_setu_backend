
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    where: { isWalkIn: false },
    take: 5,
    include: {
      customerAccount: true
    }
  });
  console.log(JSON.stringify(customers, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
