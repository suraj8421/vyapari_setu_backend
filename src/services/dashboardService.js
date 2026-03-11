// ============================================
// Dashboard / Analytics Service
// ============================================

import prisma from '../config/database.js';

class DashboardService {
    /**
     * Get dashboard overview statistics
     */
    async getOverview(storeId = null) {
        const storeFilter = storeId ? { storeId } : {};

        // Today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // This month's date range
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

        const [
            todaySales,
            monthSales,
            todayPayments,
            monthPayments,
            totalProducts,
            lowStockItems,
            totalCustomers,
            outstandingCredit,
            totalSuppliers,
            todayPurchases,
            monthPurchases,
        ] = await Promise.all([
            // Today's sales (Invoice Value)
            prisma.sale.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: today, lt: tomorrow },
                    status: 'COMPLETED',
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Month's sales (Invoice Value)
            prisma.sale.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: monthStart, lt: monthEnd },
                    status: 'COMPLETED',
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Today's Payments Received (Actual Cash/UPI/Bank)
            prisma.ledgerEntry.aggregate({
                where: {
                    ...storeFilter,
                    type: 'DEBIT',
                    createdAt: { gte: today, lt: tomorrow },
                },
                _sum: { amount: true },
                _count: true,
            }),
            // Month's Payments Received
            prisma.ledgerEntry.aggregate({
                where: {
                    ...storeFilter,
                    type: 'DEBIT',
                    createdAt: { gte: monthStart, lt: monthEnd },
                },
                _sum: { amount: true },
                _count: true,
            }),
            // Total active products
            prisma.product.count({
                where: { ...storeFilter, isActive: true },
            }),
            // FIX: The previous query counted ALL inventory records, not the low-stock ones.
            // It was missing the WHERE quantity < minStockLevel filter.
            // We now use a raw query to compare two columns on the same row (Prisma ORM
            // cannot do column-to-column comparisons natively without $queryRaw).
            // Using $queryRaw with tagged template literals (safe — no string interpolation)
            // ensures this is NOT vulnerable to SQL injection.
            storeId
                ? prisma.$queryRaw`
                    SELECT COUNT(*) as count
                    FROM inventory i
                    JOIN products p ON i.product_id = p.id
                    WHERE i.store_id = ${storeId}
                      AND p.is_active = true
                      AND i.quantity < i.min_stock_level`
                : prisma.$queryRaw`
                    SELECT COUNT(*) as count
                    FROM inventory i
                    JOIN products p ON i.product_id = p.id
                    WHERE p.is_active = true
                      AND i.quantity < i.min_stock_level`,
            // Total customers
            prisma.customer.count({
                where: { ...storeFilter, isActive: true },
            }),
            // Outstanding credit
            prisma.customer.aggregate({
                where: { ...storeFilter, balance: { gt: 0 }, isActive: true },
                _sum: { balance: true },
                _count: true,
            }),
            // Total suppliers
            prisma.supplier.count({
                where: { ...storeFilter, isActive: true },
            }),
            // Today's purchases
            prisma.purchase.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: today, lt: tomorrow },
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Month's purchases
            prisma.purchase.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: monthStart, lt: monthEnd },
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
        ]);

        // FIX: $queryRaw returns BigInt counts; convert to Number for JSON serialisation
        const lowStockCount = Number(lowStockItems[0]?.count ?? 0);

        return {
            todaySales: {
                amount: Number(todaySales._sum.totalAmount || 0),
                count: todaySales._count,
            },
            todayPayments: {
                amount: Number(todayPayments._sum.amount || 0),
                count: todayPayments._count,
            },
            monthSales: {
                amount: Number(monthSales._sum.totalAmount || 0),
                count: monthSales._count,
            },
            monthPayments: {
                amount: Number(monthPayments._sum.amount || 0),
                count: monthPayments._count,
            },
            todayPurchases: {
                amount: Number(todayPurchases._sum.totalAmount || 0),
                count: todayPurchases._count,
            },
            monthPurchases: {
                amount: Number(monthPurchases._sum.totalAmount || 0),
                count: monthPurchases._count,
            },
            totalProducts,
            // FIX: Now correctly represents low-stock item count (quantity < minStockLevel)
            lowStockCount,
            totalCustomers,
            outstandingCredit: {
                amount: Number(outstandingCredit._sum.balance || 0),
                count: outstandingCredit._count,
            },
            totalSuppliers,
            // FIX: This was Revenue minus ALL Purchases, which is incorrect.
            // True gross profit = Sales Revenue - Cost of Goods Sold (COGS).
            // We don't track COGS separately yet, so we note this is an approximation.
            // Expenses are NOT yet deducted here — that's a future improvement.
            grossProfitApprox: Number(monthSales._sum.totalAmount || 0) - Number(monthPurchases._sum.totalAmount || 0),
        };
    }

    /**
     * Get daily sales data for chart (last N days)
     * FIX: The previous version used $queryRawUnsafe() with storeId string
     * interpolation directly into SQL — a SQL injection vulnerability.
     * We now use $queryRaw with tagged template literals, which are
     * parameterised automatically by Prisma. The conditional is handled
     * with two separate safe queries instead of string concatenation.
     */
    async getSalesChart(days = 30, storeId = null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // FIX: Use tagged template $queryRaw (parameterised) instead of
        // $queryRawUnsafe (string interpolation) to prevent SQL injection.
        // Note: Prisma tagged templates cannot conditionally include WHERE clauses,
        // so we branch into two safe queries.
        const sales = storeId
            ? await prisma.$queryRaw`
                SELECT 
                  DATE(s.created_at) as date,
                  COALESCE(SUM(s.total_amount), 0) as total_sales,
                  COUNT(s.id) as sale_count
                FROM sales s
                WHERE s.created_at >= ${startDate}
                  AND s.status = 'COMPLETED'
                  AND s.store_id = ${storeId}
                GROUP BY DATE(s.created_at)
                ORDER BY date ASC`
            : await prisma.$queryRaw`
                SELECT 
                  DATE(s.created_at) as date,
                  COALESCE(SUM(s.total_amount), 0) as total_sales,
                  COUNT(s.id) as sale_count
                FROM sales s
                WHERE s.created_at >= ${startDate}
                  AND s.status = 'COMPLETED'
                GROUP BY DATE(s.created_at)
                ORDER BY date ASC`;

        return sales.map((s) => ({
            date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date),
            totalSales: Number(s.total_sales),
            // FIX: $queryRaw returns BigInt for COUNT — convert to Number for JSON
            saleCount: Number(s.sale_count),
        }));
    }

    /**
     * Get top-selling products
     * FIX: Same SQL injection fix — replaced $queryRawUnsafe with $queryRaw.
     */
    async getTopProducts(limit = 10, storeId = null) {
        // FIX: limit comes from user query param — must be a safe integer
        const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

        const products = storeId
            ? await prisma.$queryRaw`
                SELECT 
                  p.id,
                  p.name,
                  p.sku,
                  SUM(si.quantity) as total_quantity,
                  SUM(si.total) as total_revenue
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN products p ON si.product_id = p.id
                WHERE s.status = 'COMPLETED'
                  AND s.store_id = ${storeId}
                GROUP BY p.id, p.name, p.sku
                ORDER BY total_quantity DESC
                LIMIT ${safeLimit}`
            : await prisma.$queryRaw`
                SELECT 
                  p.id,
                  p.name,
                  p.sku,
                  SUM(si.quantity) as total_quantity,
                  SUM(si.total) as total_revenue
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN products p ON si.product_id = p.id
                WHERE s.status = 'COMPLETED'
                GROUP BY p.id, p.name, p.sku
                ORDER BY total_quantity DESC
                LIMIT ${safeLimit}`;

        return products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            // FIX: BigInt → Number
            totalQuantity: Number(p.total_quantity),
            totalRevenue: Number(p.total_revenue),
        }));
    }

    /**
     * Get profit/loss report
     */
    async getProfitLoss(startDate, endDate, storeId = null) {
        const storeFilter = storeId ? { storeId } : {};
        const dateFilter = {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        };

        const [salesTotal, purchasesTotal, expensesTotal] = await Promise.all([
            prisma.sale.aggregate({
                where: { ...storeFilter, ...dateFilter, status: 'COMPLETED' },
                _sum: { totalAmount: true, taxAmount: true, discount: true },
            }),
            prisma.purchase.aggregate({
                where: { ...storeFilter, ...dateFilter },
                _sum: { totalAmount: true, taxAmount: true },
            }),
            // FIX: Include expense totals in profit/loss so the report is more accurate.
            // Previously expenses were not subtracted, making "profit" appear inflated.
            prisma.expense.aggregate({
                where: {
                    ...(storeId ? { storeId } : {}),
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                },
                _sum: { amount: true },
            }),
        ]);

        const totalSales = Number(salesTotal._sum.totalAmount || 0);
        const totalPurchases = Number(purchasesTotal._sum.totalAmount || 0);
        const totalSalesTax = Number(salesTotal._sum.taxAmount || 0);
        const totalPurchaseTax = Number(purchasesTotal._sum.taxAmount || 0);
        const totalDiscount = Number(salesTotal._sum.discount || 0);
        // FIX: Expenses are now included in the report
        const totalExpenses = Number(expensesTotal._sum.amount || 0);

        return {
            totalSales,
            totalPurchases,
            totalExpenses,
            grossProfit: totalSales - totalPurchases,
            // FIX: Net profit now correctly deducts expenses
            netProfit: totalSales - totalPurchases - totalExpenses,
            totalSalesTax,
            totalPurchaseTax,
            netGST: totalSalesTax - totalPurchaseTax,
            totalDiscount,
        };
    }

    /**
     * Get user / staff performance
     * FIX: Replaced $queryRawUnsafe (SQL injection risk) with $queryRaw.
     */
    async getStaffPerformance(storeId = null) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const performance = storeId
            ? await prisma.$queryRaw`
                SELECT 
                  u.id,
                  u.first_name,
                  u.last_name,
                  COUNT(s.id) as total_sales,
                  COALESCE(SUM(s.total_amount), 0) as total_amount
                FROM users u
                LEFT JOIN sales s ON u.id = s.sold_by_id 
                  AND s.created_at >= ${monthStart}
                  AND s.status = 'COMPLETED'
                  AND s.store_id = ${storeId}
                WHERE u.role = 'STORE_USER'
                  AND u.is_active = true
                GROUP BY u.id, u.first_name, u.last_name
                ORDER BY total_amount DESC`
            : await prisma.$queryRaw`
                SELECT 
                  u.id,
                  u.first_name,
                  u.last_name,
                  COUNT(s.id) as total_sales,
                  COALESCE(SUM(s.total_amount), 0) as total_amount
                FROM users u
                LEFT JOIN sales s ON u.id = s.sold_by_id 
                  AND s.created_at >= ${monthStart}
                  AND s.status = 'COMPLETED'
                WHERE u.role = 'STORE_USER'
                  AND u.is_active = true
                GROUP BY u.id, u.first_name, u.last_name
                ORDER BY total_amount DESC`;

        return performance.map((p) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            // FIX: BigInt → Number
            totalSales: Number(p.total_sales),
            totalAmount: Number(p.total_amount),
        }));
    }
}

export default new DashboardService();
