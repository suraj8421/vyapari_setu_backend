// ============================================
// Credit Score Service
// ============================================

import prisma from '../config/database.js';

class CreditScoreService {
    /**
     * Calculates and saves the credit score for a customer
     * @param {string} customerId 
     */
    async calculateAndSaveScore(customerId) {
        try {
            const customer = await prisma.customer.findUnique({
                where: { id: customerId },
                include: {
                    sales: {
                        where: { status: { not: 'CANCELLED' } },
                        orderBy: { createdAt: 'desc' },
                        take: 50 // Look at last 50 sales for scoring
                    },
                    ledgerEntries: {
                        where: { type: 'DEBIT' },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });

            if (!customer) return;

            let score = 100;

            for (const sale of customer.sales) {
                // Determine if fully paid
                const isPaid = Number(sale.paidAmount) >= Number(sale.totalAmount);
                const dueDate = sale.dueDate || sale.createdAt;

                if (isPaid) {
                    // Find when it was fully paid
                    // We look for DEBIT entries associated with this sale or generally after the sale
                    const paymentEntries = customer.ledgerEntries.filter(e => 
                        e.saleId === sale.id || (e.createdAt >= sale.createdAt && !e.saleId)
                    );

                    if (paymentEntries.length > 0) {
                        // The payment date is the latest DEBIT entry that made the balance full
                        const paymentDate = new Date(Math.max(...paymentEntries.map(e => new Date(e.createdAt).getTime())));
                        const delayDays = Math.max(0, Math.floor((paymentDate - dueDate) / (1000 * 60 * 60 * 24)));

                        if (delayDays <= 0) {
                            score += 1;
                        } else {
                            score -= delayDays * 0.5;
                        }
                    } else {
                        // paidAmount >= totalAmount but no ledger entry? 
                        // Likely a cash sale paid instantly
                        score += 1;
                    }
                } else {
                    // Pending or Partial
                    // IF pending for more than due date, or just penalty
                    score -= 5;
                    
                    // Extra penalty if overdue
                    const now = new Date();
                    if (now > dueDate) {
                        const delayDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
                        score -= Math.min(20, delayDays * 0.5); // Cap overdue penalty
                    }
                }
            }

            // Clamp score 0-100
            score = Math.max(0, Math.min(100, Math.round(score)));

            // Determine category
            let category = 'Average';
            if (score >= 80) category = 'Trusted';
            else if (score < 50) category = 'Risky';

            // Update customer
            await prisma.customer.update({
                where: { id: customerId },
                data: {
                    creditScore: score,
                    creditCategory: category
                }
            });

            return { score, category };
        } catch (err) {
            console.error('Error calculating credit score:', err);
        }
    }
}

export default new CreditScoreService();
