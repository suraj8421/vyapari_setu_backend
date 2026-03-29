import prisma from './src/config/database.js';

async function testAnalytics() {
    try {
        console.log('Testing analytics retrieval...');
        const users = await prisma.user.findMany({
            where: { isDeleted: false },
            include: { clientSubscriptions: true, systemPayments: true, assignedAgent: true }
        });
        console.log('Fetched users count:', users.length);
        process.exit(0);
    } catch (e) {
        console.error('FAILED ANALYSIS:');
        console.error(e);
        process.exit(1);
    }
}

testAnalytics();
