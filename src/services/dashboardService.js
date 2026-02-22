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
            totalProducts,
            lowStockCount,
            totalCustomers,
            outstandingCredit,
            totalSuppliers,
            todayPurchases,
            monthPurchases,
        ] = await Promise.all([
            // Today's sales
            prisma.sale.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: today, lt: tomorrow },
                    status: 'COMPLETED',
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Month's sales
            prisma.sale.aggregate({
                where: {
                    ...storeFilter,
                    createdAt: { gte: monthStart, lt: monthEnd },
                    status: 'COMPLETED',
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Total active products
            prisma.product.count({
                where: { ...storeFilter, isActive: true },
            }),
            // Low stock items
            prisma.inventory.count({
                where: {
                    ...storeFilter,
                    product: { isActive: true },
                },
            }),
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

        return {
            todaySales: {
                amount: Number(todaySales._sum.totalAmount || 0),
                count: todaySales._count,
            },
            monthSales: {
                amount: Number(monthSales._sum.totalAmount || 0),
                count: monthSales._count,
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
            lowStockCount,
            totalCustomers,
            outstandingCredit: {
                amount: Number(outstandingCredit._sum.balance || 0),
                count: outstandingCredit._count,
            },
            totalSuppliers,
            profitThisMonth: Number(monthSales._sum.totalAmount || 0) - Number(monthPurchases._sum.totalAmount || 0),
        };
    }

    /**
     * Get daily sales data for chart (last N days)
     */
    async getSalesChart(days = 30, storeId = null) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const storeFilter = storeId ? `AND s.store_id = '${storeId}'` : '';

        const sales = await prisma.$queryRawUnsafe(`
      SELECT 
        DATE(s.created_at) as date,
        COALESCE(SUM(s.total_amount), 0) as total_sales,
        COUNT(s.id) as sale_count
      FROM sales s
      WHERE s.created_at >= $1
        AND s.status = 'COMPLETED'
        ${storeFilter}
      GROUP BY DATE(s.created_at)
      ORDER BY date ASC
    `, startDate);

        return sales.map((s) => ({
            date: s.date.toISOString().slice(0, 10),
            totalSales: Number(s.total_sales),
            saleCount: Number(s.sale_count),
        }));
    }

    /**
     * Get top-selling products
     */
    async getTopProducts(limit = 10, storeId = null) {
        const storeFilter = storeId ? `AND s.store_id = '${storeId}'` : '';

        const products = await prisma.$queryRawUnsafe(`
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
        ${storeFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_quantity DESC
      LIMIT $1
    `, limit);

        return products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
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

        const [salesTotal, purchasesTotal, salesTax] = await Promise.all([
            prisma.sale.aggregate({
                where: { ...storeFilter, ...dateFilter, status: 'COMPLETED' },
                _sum: { totalAmount: true, taxAmount: true, discount: true },
            }),
            prisma.purchase.aggregate({
                where: { ...storeFilter, ...dateFilter },
                _sum: { totalAmount: true, taxAmount: true },
            }),
            prisma.sale.aggregate({
                where: { ...storeFilter, ...dateFilter, status: 'COMPLETED' },
                _sum: { taxAmount: true },
            }),
        ]);

        const totalSales = Number(salesTotal._sum.totalAmount || 0);
        const totalPurchases = Number(purchasesTotal._sum.totalAmount || 0);
        const totalSalesTax = Number(salesTax._sum.taxAmount || 0);
        const totalPurchaseTax = Number(purchasesTotal._sum.taxAmount || 0);
        const totalDiscount = Number(salesTotal._sum.discount || 0);

        return {
            totalSales,
            totalPurchases,
            grossProfit: totalSales - totalPurchases,
            totalSalesTax,
            totalPurchaseTax,
            netGST: totalSalesTax - totalPurchaseTax,
            totalDiscount,
        };
    }

    /**
     * Get user / staff performance
     */
    async getStaffPerformance(storeId = null) {
        const storeFilter = storeId ? `AND s.store_id = '${storeId}'` : '';

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const performance = await prisma.$queryRawUnsafe(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        COUNT(s.id) as total_sales,
        COALESCE(SUM(s.total_amount), 0) as total_amount
      FROM users u
      LEFT JOIN sales s ON u.id = s.sold_by_id 
        AND s.created_at >= $1
        AND s.status = 'COMPLETED'
        ${storeFilter}
      WHERE u.role = 'STORE_USER'
        AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total_amount DESC
    `, monthStart);

        return performance.map((p) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            totalSales: Number(p.total_sales),
            totalAmount: Number(p.total_amount),
        }));
    }
}

export default new DashboardService();
