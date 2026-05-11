import prisma from '../config/database.js';
import { success } from '../utils/response.js';

const saDashboardController = {
    async getStats(req, res, next) {
        try {
            const { range = '30d' } = req.query;
            const now = new Date();
            let startDate = new Date();

            switch (range) {
                case '30d':
                    startDate.setDate(now.getDate() - 30);
                    break;
                case '3m':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '1y':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                case 'all':
                    startDate = new Date(0); // Beginning of time
                    break;
                default:
                    startDate.setDate(now.getDate() - 30);
            }

            console.log(`[SADashboard] Fetching stats for range: ${range} (since ${startDate.toISOString()})`);

            const [
                totalUsers,
                totalEmployees,
                activeSubscriptions,
                expiredSubscriptions,
                pendingManualPayments,
                totalLeads,
                convertedLeads,
                rangePayments
            ] = await Promise.all([
                prisma.user.count({ where: { isDeleted: false } }).catch(() => 0),
                prisma.employee.count({ where: { isDeleted: false } }).catch(() => 0),
                prisma.clientSubscription.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                prisma.clientSubscription.count({
                    where: { endDate: { lt: now }, status: 'ACTIVE' }
                }).catch(() => 0),
                prisma.systemPayment.count({
                    where: { method: 'CASH', status: 'PENDING' }
                }).catch(() => 0),
                prisma.lead.count({ where: { createdAt: { gte: startDate } } }).catch(() => 0),
                prisma.lead.count({ where: { status: 'CONVERTED', createdAt: { gte: startDate } } }).catch(() => 0),
                prisma.systemPayment.findMany({
                    where: { status: 'SUCCESS', createdAt: { gte: startDate } },
                    select: { amount: true }
                }).catch(() => [])
            ]);

            const revenue = (rangePayments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0) / 100;

            const stats = {
                totalUsers: { value: totalUsers, trend: '+0%' },
                totalEmployees: { value: totalEmployees, trend: '+0%' },
                activeSubscriptions: { value: activeSubscriptions, trend: '+0%' },
                monthlyRevenue: { value: revenue, trend: '+0%' },
                expiredSubscriptions: { value: expiredSubscriptions, trend: '0%' },
                pendingManualPayments: { value: pendingManualPayments, trend: '+0%' },
                totalLeads: { value: totalLeads, trend: '+0%' },
                convertedLeads: { value: convertedLeads, trend: '+0%' }
            };

            return success(res, stats, `Super Admin Dashboard stats fetched for ${range}`);
        } catch (err) {
            console.error('[SADashboard] Global Error:', err);
            next(err);
        }
    },

    async getSubscriptionGrowth(req, res, next) {
        try {
            const growth = [];
            const now = new Date();
            
            for (let i = 0; i < 5; i++) {
                const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
                const monthName = start.toLocaleString('default', { month: 'long', year: 'numeric' });

                const [newSubs, renewals, monthlyPayments] = await Promise.all([
                    prisma.clientSubscription.count({
                        where: { createdAt: { gte: start, lte: end } }
                    }).catch(() => 0),
                    prisma.clientSubscription.count({
                        where: { updatedAt: { gte: start, lte: end }, status: 'ACTIVE' }
                    }).then(count => Math.max(0, count)).catch(() => 0),
                    prisma.systemPayment.findMany({
                        where: { status: 'SUCCESS', createdAt: { gte: start, lte: end } },
                        select: { amount: true }
                    }).catch(() => [])
                ]);

                growth.push({
                    month: monthName,
                    new: newSubs,
                    renewals: renewals,
                    rev: ((monthlyPayments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0) / 100).toLocaleString('en-IN')
                });
            }

            return success(res, growth, 'Subscription growth data fetched');
        } catch (err) {
            console.error('[SADashboard] Growth Error:', err);
            next(err);
        }
    }
};

export default saDashboardController;
