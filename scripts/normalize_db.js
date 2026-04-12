import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('Normalizing existing products: converting "" to null for barcode, category, hsnCode...');
  const result = await prisma.product.updateMany({
    where: { barcode: '' },
    data: { barcode: null }
  });
  console.log(`Updated ${result.count} products with empty barcode.`);

  const result2 = await prisma.product.updateMany({
    where: { category: '' },
    data: { category: null }
  });
  console.log(`Updated ${result2.count} products with empty category.`);

  const result3 = await prisma.product.updateMany({
    where: { hsnCode: '' },
    data: { hsnCode: null }
  });
  console.log(`Updated ${result3.count} products with empty HSN code.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
