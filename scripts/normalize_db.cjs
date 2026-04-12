const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Normalizing existing products: converting "" to null for barcode, category, hsnCode...');
  const result = await prisma.product.updateMany({
    where: { barcode: '' },
    data: { barcode: null }
  });
  console.log(`Updated ${result.count} products with empty barcode.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
