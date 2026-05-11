import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Testing DB connection...');
        await prisma.$connect();
        console.log('✅ Connected successfully!');
        const count = await prisma.customer.count();
        console.log(`Customer count: ${count}`);
    } catch (err) {
        console.error('❌ Connection failed:');
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
