import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const lead = await prisma.lead.create({
            data: {
                businessName: "Test Manual 2",
                contactName: "Test",
                phone: "1234567890",
                source: "Website",
                status: "NEW"
            }
        });
        console.log("SUCCESS");
        console.log(JSON.stringify(lead));
    } catch (e) {
        console.log("ERROR");
        console.log(e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
