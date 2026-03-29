import prisma from './src/config/database.js';

async function testSimpleCreate() {
    try {
        console.log('Testing simple create...');
        const user = await prisma.user.create({
            data: {
                email: 'simple' + Date.now() + '@gmail.com',
                password: 'abc',
                firstName: 'Test',
                lastName: 'User'
            }
        });
        console.log('Success:', user.id);
    } catch (e) {
        console.error('FAILED Simple Create:');
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

testSimpleCreate();
