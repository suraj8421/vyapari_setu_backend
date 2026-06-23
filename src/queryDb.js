import prisma from './config/database.js';

async function main() {
    try {
        const stores = await prisma.store.findMany({
            select: { id: true, name: true }
        });
        const users = await prisma.user.findMany({
            select: { id: true, firstName: true, lastName: true, email: true, role: true, storeId: true }
        });
        const products = await prisma.product.findMany({
            select: { id: true, name: true, sku: true, storeId: true }
        });

        console.log("=== STORES ===");
        console.log(JSON.stringify(stores, null, 2));
        console.log("\n=== USERS ===");
        console.log(JSON.stringify(users, null, 2));
        console.log("\n=== PRODUCTS ===");
        console.log(JSON.stringify(products, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
