import prisma from './src/config/database.js';

async function test() {
    try {
        console.log('Testing User count...');
        const userCount = await prisma.user.count();
        console.log('User count:', userCount);

        console.log('Testing Employee count...');
        const empCount = await prisma.employee.count();
        console.log('Employee count:', empCount);

        console.log('Testing Lead count...');
        const leadCount = await prisma.lead.count();
        console.log('Lead count:', leadCount);

        console.log('Testing SystemPayment count...');
        const payCount = await prisma.systemPayment.count();
        console.log('SystemPayment count:', payCount);

        console.log('Testing ClientSubscription count...');
        const subCount = await prisma.clientSubscription.count();
        console.log('ClientSubscription count:', subCount);

        process.exit(0);
    } catch (err) {
        console.error('TEST FAILED:', err);
        process.exit(1);
    }
}

test();
