import prisma from './src/config/database.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';

async function testCreate() {
    try {
        console.log('Testing create user...');
        const hashedPassword = await bcrypt.hash('Vyapari@123', 10);
        const user = await prisma.user.create({
            data: {
                firstName: 'sooraj',
                lastName: 'kumar',
                phone: '9909909900',
                email: 'test' + Date.now() + '@gmail.com',
                password: hashedPassword,
                role: 'STORE_USER',
                platformStatus: 'ACTIVE'
            }
        });
        console.log('User created:', user.id);
        fs.writeFileSync('test_output.txt', 'Success: ' + user.id);
    } catch (e) {
        console.log('Caught error');
        fs.writeFileSync('test_output.txt', 'Error: ' + e.message + '\nStack: ' + e.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testCreate();
