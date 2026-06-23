import prisma from '../config/database.js';
import bcrypt from 'bcryptjs';

export const getDashboardAnalytics = async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            where: { isDeleted: false },
            include: { clientSubscriptions: true, systemPayments: true, assignedAgent: true }
        });

        const activeSub = await prisma.clientSubscription.count({ where: { status: 'ACTIVE' } });
        const expiredSub = await prisma.clientSubscription.count({ where: { status: 'EXPIRED' } });
        
        let totalRevenue = 0;
        let monthlyRevenue = 0;
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        let renewalDueCount = 0;
        const employeeSales = {};

        users.forEach(u => {
            const sortedSubs = [...u.clientSubscriptions].sort((a,b) => new Date(b.endDate) - new Date(a.endDate));
            const latestSub = sortedSubs[0];
            
            if (latestSub && latestSub.endDate > new Date() && latestSub.endDate <= sevenDaysFromNow) {
                renewalDueCount++;
            }

            u.systemPayments.forEach(p => {
                if (p.status === 'SUCCESS') {
                    const amt = parseFloat(p.amount) / 100;
                    totalRevenue += amt;
                    if (new Date(p.createdAt) >= startOfMonth) {
                        monthlyRevenue += amt;
                    }

                    if (u.assignedAgentId) {
                        const empName = u.assignedAgent?.name || 'Unknown';
                        employeeSales[empName] = (employeeSales[empName] || 0) + amt;
                    }
                }
            });
        });

        let topPerformingEmployee = 'N/A';
        let maxSales = 0;
        Object.entries(employeeSales).forEach(([name, sales]) => {
            if (sales > maxSales) {
                maxSales = sales;
                topPerformingEmployee = name;
            }
        });

        const dashboardData = {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.platformStatus === 'ACTIVE').length,
            inactiveUsers: users.filter(u => u.platformStatus === 'INACTIVE').length,
            pendingUsers: users.filter(u => u.platformStatus === 'PENDING').length,
            deletedUsers: await prisma.user.count({ where: { isDeleted: true } }),
            activeSubscriptions: activeSub,
            expiredSubscriptions: expiredSub,
            renewalDueUsers: renewalDueCount,
            totalRevenue,
            monthlyRevenue,
            topPerformingEmployee
        };

        res.json({ success: true, data: dashboardData });
    } catch (error) { 
        next(error); 
    }
};

export const getAllUsers = async (req, res, next) => {
    try {
        const { search, status, employeeId, page = 1, limit = 50 } = req.query;
        let where = { isDeleted: false };
        
        if (status && status !== 'All Status') where.platformStatus = status;
        if (employeeId) where.assignedAgentId = employeeId;
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { userCode: { contains: search, mode: 'insensitive' } },
                { store: { name: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where, skip, take: parseInt(limit),
                include: {
                    store: true,
                    assignedAgent: { select: { id: true, name: true, code: true } },
                    clientSubscriptions: { include: { plan: true }, orderBy: { endDate: 'desc' }, take: 1 },
                    systemPayments: { where: { status: 'SUCCESS' } }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);

        const mappedUsers = users.map(u => {
            const currentSub = u.clientSubscriptions[0];
            const totalPayments = u.systemPayments.reduce((acc, p) => acc + parseFloat(p.amount), 0) / 100;
            return {
                ...u,
                totalPayments,
                currentPlan: currentSub ? currentSub.plan.name : 'No Plan',
                subscriptionEnd: currentSub ? currentSub.endDate : null
            };
        });

        // Calculate quick summary analytics using optimized database operations
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const next7Days = new Date();
        next7Days.setDate(next7Days.getDate() + 7);

        const [
            totalUsers,
            activeUsers,
            revenueAggregate,
            renewalDueUsers
        ] = await Promise.all([
            prisma.user.count({ where: { isDeleted: false } }),
            prisma.user.count({ where: { isDeleted: false, platformStatus: 'ACTIVE' } }),
            prisma.systemPayment.aggregate({
                where: { status: 'SUCCESS', createdAt: { gte: startOfMonth } },
                _sum: { amount: true }
            }),
            prisma.user.count({
                where: {
                    isDeleted: false,
                    clientSubscriptions: {
                        some: {
                            status: 'ACTIVE',
                            endDate: { lte: next7Days }
                        }
                    }
                }
            })
        ]);

        const analytics = {
            totalUsers,
            activeUsers,
            monthlyRevenue: Math.round(Number(revenueAggregate._sum.amount || 0) / 100),
            renewalDueUsers
        };

        res.json({ success: true, data: mappedUsers, analytics, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
    } catch (error) { next(error); }
};

export const getUserById = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: {
                store: true,
                assignedAgent: { select: { id: true, name: true, code: true } },
                clientSubscriptions: { include: { plan: true }, orderBy: { endDate: 'desc' } },
                systemPayments: { orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true } } } }
            }
        });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (error) { next(error); }
};

export const createUser = async (req, res, next) => {
    try {
        const { 
            firstName, lastName, phone, email, password, 
            platformStatus, notes, assignedAgentId, role = 'ADMIN', 
            storeDetails, planId, paymentMethod = 'CASH', amountReceived 
        } = req.body;
        
        const existing = await prisma.user.findFirst({ where: { email } });
        if (existing) return res.status(400).json({ success: false, message: 'Email already registered.' });

        const hashedPassword = await bcrypt.hash(password || phone, 10);
        let storeId = null;

        if (storeDetails && storeDetails.name) {
            const store = await prisma.store.create({ data: storeDetails });
            storeId = store.id;
        }

        const user = await prisma.user.create({
            data: {
                firstName, lastName, phone, email, password: hashedPassword, role, platformStatus, notes, assignedAgentId, storeId
            }
        });

        // ─── If Plan Selected, Provision Subscription ──────────────────
        if (planId) {
            const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
            if (plan) {
                const start = new Date();
                const end = new Date();
                end.setMonth(end.getMonth() + plan.durationMonths);

                const sub = await prisma.clientSubscription.create({
                    data: {
                        userId: user.id,
                        planId: plan.id,
                        startDate: start,
                        endDate: end,
                        status: 'ACTIVE'
                    }
                });

                // Record initial manual payment
                await prisma.systemPayment.create({
                    data: {
                        amount: amountReceived ? Math.round(parseFloat(amountReceived) * 100) : Math.round(Number(plan.price) * 100),
                        method: paymentMethod || 'CASH',
                        status: 'SUCCESS',
                        userId: user.id,
                        subscriptionId: sub.id,
                        paymentId: 'Initial Onboarding Payment'
                    }
                });
            }
        }

        res.status(201).json({ success: true, data: user });
    } catch (error) { 
        console.error('CreateUser error:', error);
        next(error); 
    }
};

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, platformStatus, notes, assignedAgentId, storeDetails } = req.body;
        
        const user = await prisma.user.update({
            where: { id },
            data: { firstName, lastName, phone, platformStatus, notes, assignedAgentId },
            include: { store: true }
        });

        if (storeDetails && user.storeId) {
            await prisma.store.update({ where: { id: user.storeId }, data: storeDetails });
        } else if (storeDetails && storeDetails.name && !user.storeId) {
            const st = await prisma.store.create({ data: storeDetails });
            await prisma.user.update({ where: { id: user.id }, data: { storeId: st.id } });
        }

        res.json({ success: true, data: user });
    } catch (error) { next(error); }
};

export const changeUserStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = await prisma.user.update({ where: { id }, data: { platformStatus: status, isActive: status === 'ACTIVE' } });
        res.json({ success: true, data: user });
    } catch (error) { next(error); }
};

export const softDeleteUser = async (req, res, next) => {
    try {
        await prisma.user.update({ where: { id: req.params.id }, data: { isDeleted: true, platformStatus: 'DELETED' } });
        res.json({ success: true, message: 'User deleted' });
    } catch (error) { next(error); }
};

export const getAllPayments = async (req, res, next) => {
    try {
        const payments = await prisma.systemPayment.findMany({
            include: {
                user: { select: { firstName: true, lastName: true, store: true } },
                subscription: { include: { plan: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`[SA-Finance] Retrieved ${payments.length} payment records`);
        res.json({ success: true, data: payments });
    } catch (error) { next(error); }
};

export const hardDeleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch user to obtain storeId
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const storeId = user.storeId;

        if (storeId) {
            // Get all user IDs in this store to clean up their personal subscriptions/payments/notifications
            const storeUsers = await prisma.user.findMany({
                where: { storeId },
                select: { id: true }
            });
            const userIds = storeUsers.map(u => u.id);

            // Execute cascading deletes inside a single transaction
            await prisma.$transaction(async (tx) => {
                // Delete B2B Store Message records referencing store invoices
                await tx.storeMessage.deleteMany({
                    where: {
                        invoice: {
                            OR: [
                                { sellerStoreId: storeId },
                                { buyerStoreId: storeId }
                            ]
                        }
                    }
                });

                // Delete B2B Store Invoice items referencing store invoices
                await tx.storeInvoiceItem.deleteMany({
                    where: {
                        invoice: {
                            OR: [
                                { sellerStoreId: storeId },
                                { buyerStoreId: storeId }
                            ]
                        }
                    }
                });

                // Delete B2B Store Invoices
                await tx.storeInvoice.deleteMany({
                    where: {
                        OR: [
                            { sellerStoreId: storeId },
                            { buyerStoreId: storeId }
                        ]
                    }
                });

                // Delete B2B Store Connections
                await tx.storeConnection.deleteMany({
                    where: {
                        OR: [
                            { supplierStoreId: storeId },
                            { buyerStoreId: storeId }
                        ]
                    }
                });

                // Delete Approval Notifications
                await tx.approvalNotification.deleteMany({
                    where: { storeId }
                });

                // Delete Audit Logs for all store users
                await tx.auditLog.deleteMany({
                    where: {
                        OR: [
                            { changedById: { in: userIds } },
                            { approvedById: { in: userIds } }
                        ]
                    }
                });

                // Delete Store Notifications for all store users
                await tx.storeNotification.deleteMany({
                    where: {
                        userId: { in: userIds }
                    }
                });

                // Delete System Payments (subscriptions history) for all store users
                await tx.systemPayment.deleteMany({
                    where: {
                        userId: { in: userIds }
                    }
                });

                // Delete Client Subscriptions for all store users
                await tx.clientSubscription.deleteMany({
                    where: {
                        userId: { in: userIds }
                    }
                });

                // Delete Customer Notifications (Sale notifications)
                await tx.customerNotification.deleteMany({
                    where: {
                        sale: { storeId }
                    }
                });

                // Delete Customer Accounts (Customer portal accounts)
                await tx.customerAccount.deleteMany({
                    where: {
                        customer: { storeId }
                    }
                });

                // Delete Online Payments (Customer gateway payments)
                await tx.onlinePayment.deleteMany({
                    where: {
                        customer: { storeId }
                    }
                });

                // Delete Ledger Entries (recorded payments/credits)
                await tx.ledgerEntry.deleteMany({
                    where: {
                        OR: [
                            { store_id: storeId },
                            { customer: { storeId } },
                            { recordedById: { in: userIds } }
                        ]
                    }
                });

                // Delete Sale Payments
                await tx.salePayment.deleteMany({
                    where: {
                        sale: { storeId }
                    }
                });

                // Delete Sale Items
                await tx.saleItem.deleteMany({
                    where: {
                        sale: { storeId }
                    }
                });

                // Delete Sales
                await tx.sale.deleteMany({
                    where: { storeId }
                });

                // Delete Purchase Items
                await tx.purchaseItem.deleteMany({
                    where: {
                        purchase: { storeId }
                    }
                });

                // Delete Purchases
                await tx.purchase.deleteMany({
                    where: { storeId }
                });

                // Delete Expenses
                await tx.expense.deleteMany({
                    where: { storeId }
                });

                // Delete Inventory
                await tx.inventory.deleteMany({
                    where: { storeId }
                });

                // Delete Products
                await tx.product.deleteMany({
                    where: { storeId }
                });

                // Delete Customers
                await tx.customer.deleteMany({
                    where: { storeId }
                });

                // Delete Suppliers
                await tx.supplier.deleteMany({
                    where: { storeId }
                });

                // Delete all Users of this store
                await tx.user.deleteMany({
                    where: { storeId }
                });

                // Finally delete the Store itself
                await tx.store.delete({
                    where: { id: storeId }
                });
            });
        } else {
            // Delete only this user's records if no store is linked
            await prisma.$transaction(async (tx) => {
                await tx.storeNotification.deleteMany({ where: { userId: id } });
                await tx.systemPayment.deleteMany({ where: { userId: id } });
                await tx.clientSubscription.deleteMany({ where: { userId: id } });
                await tx.auditLog.deleteMany({
                    where: {
                        OR: [
                            { changedById: id },
                            { approvedById: id }
                        ]
                    }
                });
                await tx.user.delete({ where: { id } });
            });
        }

        res.json({ success: true, message: 'User and all associated store data permanently deleted' });
    } catch (error) { 
        console.error('Hard delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to permanently delete user. ' + (error.message || '') });
    }
};

export const addPayment = async (req, res, next) => {
    try {
        const { userId, amount, method = 'CASH', notes } = req.body;
        const currentSub = await prisma.clientSubscription.findFirst({
            where: { userId }, orderBy: { endDate: 'desc' }
        });

        const payment = await prisma.systemPayment.create({
            data: {
                amount: Math.round(parseFloat(amount) * 100),
                method,
                status: 'SUCCESS',
                userId,
                subscriptionId: currentSub ? currentSub.id : null,
                paymentId: notes || 'Manual Payment'
            }
        });
        res.status(201).json({ success: true, data: payment });
    } catch (error) { next(error); }
};

export const assignSubscription = async (req, res, next) => {
    try {
        const { userId, planId, durationMonths } = req.body;
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if(!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        
        let start = new Date();
        const existingSub = await prisma.clientSubscription.findFirst({ where: { userId }, orderBy: { endDate: 'desc' } });
        if (existingSub && existingSub.endDate > start) { start = existingSub.endDate; }

        let end = new Date(start);
        end.setMonth(end.getMonth() + parseInt(durationMonths || plan.durationMonths));

        const sub = await prisma.clientSubscription.create({
            data: {
                userId, planId, startDate: start, endDate: end, status: 'ACTIVE'
            }
        });
        
        // ensure user is active 
        await prisma.user.update({ where: { id: userId }, data: { platformStatus: 'ACTIVE', isActive: true } });

        res.status(201).json({ success: true, data: sub });
    } catch (error) { next(error); }
};

export const exportUsers = async (req, res, next) => {
    try {
        const { search, status, employeeId } = req.query;
        let where = { isDeleted: false };
        
        if (status && status !== 'All Status') where.platformStatus = status;
        if (employeeId) where.assignedAgentId = employeeId;
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { userCode: { contains: search, mode: 'insensitive' } },
                { store: { name: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const users = await prisma.user.findMany({
            where,
            include: { 
                store: true, 
                assignedAgent: { select: { name: true } }, 
                clientSubscriptions: { include: { plan: true }, orderBy: { endDate: 'desc' }, take: 1 } 
            },
            orderBy: { createdAt: 'desc' }
        });

        let csv = 'Name,Business,Phone,Email,Status,Plan,Expiry,AssignedAgent\n';
        users.forEach(u => {
            const sub = u.clientSubscriptions[0];
            csv += `"${u.firstName} ${u.lastName}","${u.store?.name || ''}","${u.phone || ''}","${u.email}","${u.platformStatus}","${sub?.plan?.name || ''}","${sub?.endDate?.toLocaleDateString('en-GB') || ''}","${u.assignedAgent?.name || ''}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.status(200).send(csv);
    } catch (error) { next(error); }
};

export const exportPayments = async (req, res, next) => {
    try {
        const payments = await prisma.systemPayment.findMany({
            where: { status: 'SUCCESS' },
            include: { user: { include: { store: true } } },
            orderBy: { createdAt: 'desc' }
        });

        const csv = 'Date,Client,Store,Amount,Method,PaymentID\n' + 
            payments.map(p => `"${p.createdAt.toLocaleDateString()}","${p.user.firstName} ${p.user.lastName}","${p.user.store?.name || ''}","${(parseFloat(p.amount) / 100).toFixed(2)}","${p.method}","${p.paymentId || 'MANUAL_PAY'}"`).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=payments_export.csv');
        res.status(200).send(csv);
    } catch (error) { next(error); }
};

export const exportSubscriptions = async (req, res, next) => {
    try {
        const subs = await prisma.clientSubscription.findMany({
            include: { 
                user: { include: { store: true } },
                plan: true
            },
            orderBy: { endDate: 'desc' }
        });

        const csv = 'Client,Store,Plan,Price,StartDate,EndDate,Status\n' +
            subs.map(s => `"${s.user.firstName} ${s.user.lastName}","${s.user.store?.name || ''}","${s.plan.name}","${(parseFloat(s.plan.price) / 100).toFixed(2)}","${s.startDate.toLocaleDateString()}","${s.endDate.toLocaleDateString()}","${s.status}"`).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=subscriptions_export.csv');
        res.status(200).send(csv);
    } catch (error) { next(error); }
};
