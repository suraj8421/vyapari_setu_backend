import prisma from '../config/database.js';
import b2bInvoiceService from './b2bInvoiceService.js';

class B2bCronService {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.lastSuccess = null;
        this.errors = [];
    }

    async withRetry(fn, retries = 3) {
        try {
            return await fn();
        } catch (err) {
            if (retries <= 0) throw err;
            console.log(`[B2B Cron] Retrying DB operation... (${retries} retries left)`);
            await new Promise(r => setTimeout(r, 2000));
            return this.withRetry(fn, retries - 1);
        }
    }

    async processAutoConfirmations() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastRun = new Date().toISOString();

        try {
            console.log('[B2B Cron] Checking for expired pending invoices...');
            
            // Retry DB connection if needed (handles Neon cold starts)
            await this.withRetry(() => prisma.$connect());

            const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

            const expiredInvoices = await this.withRetry(() => prisma.storeInvoice.findMany({
                where: {
                    status: 'PENDING_CONFIRMATION',
                    createdAt: { lte: fortyEightHoursAgo }
                }
            }));

            console.log(`[B2B Cron] Found ${expiredInvoices.length} invoices to auto-confirm.`);

            let successCount = 0;
            let failCount = 0;

            for (const invoice of expiredInvoices) {
                try {
                    const buyerUser = await this.withRetry(() => prisma.user.findFirst({ where: { storeId: invoice.buyerStoreId } }));
                    
                    await b2bInvoiceService.confirmInvoice(invoice.id, invoice.buyerStoreId, buyerUser?.id || 'SYSTEM_AUTO_CONFIRM');
                    
                    await this.withRetry(() => prisma.storeInvoice.update({
                        where: { id: invoice.id },
                        data: { status: 'AUTO_CONFIRMED' }
                    }));

                    successCount++;
                } catch (err) {
                    console.error(`[B2B Cron] Failed to auto-confirm invoice ${invoice.id}:`, err);
                    failCount++;
                    this.errors.push({ time: new Date().toISOString(), error: err.message || err });
                    if (this.errors.length > 50) this.errors.shift();
                }
            }

            console.log(`[B2B Cron] Auto-confirm run complete. Success: ${successCount}. Failed: ${failCount}.`);
            this.lastSuccess = true;
        } catch (err) {
            console.error("[B2B Cron] CRON FAILURE:", err);
            this.lastSuccess = false;
            this.errors.push({ time: new Date().toISOString(), error: err.message || err });
            if (this.errors.length > 50) this.errors.shift();
        } finally {
            this.isRunning = false;
        }
    }

    start() {
        // Run safely every 60 seconds
        setInterval(async () => {
            await this.processAutoConfirmations();
        }, 60000);
        
        // Run once on startup after 10 seconds
        setTimeout(async () => await this.processAutoConfirmations(), 10000);

        // Keep Neon Awake Ping
        setInterval(async () => {
            try {
                await prisma.$queryRaw`SELECT 1`;
            } catch (err) {
                console.error("[B2B Cron] Keep-alive failed:", err);
            }
        }, 5 * 60 * 1000);
    }

    getStatus() {
        return {
            lastRun: this.lastRun,
            success: this.lastSuccess,
            errors: this.errors
        };
    }
}

export default new B2bCronService();
