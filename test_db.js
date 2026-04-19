import prisma from './src/config/database.js';
try {
    await prisma.$connect();
    console.log('Database connected successfully');
    const users = await prisma.user.count();
    console.log('User count:', users);
    process.exit(0);
} catch (err) {
    console.error('Database connection failed:');
    console.error(err);
    process.exit(1);
}
