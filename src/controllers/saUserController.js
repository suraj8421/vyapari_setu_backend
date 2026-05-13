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

        // Calculate quick summary analytics
        const allUsers = await prisma.user.findMany({ 
            where: { isDeleted: false }, 
            include: { clientSubscriptions: true, systemPayments: true } 
        });
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        let monthlyRevenue = 0;
        allUsers.forEach(u => {
            u.systemPayments.forEach(p => {
                if (p.status === 'SUCCESS' && new Date(p.createdAt) >= startOfMonth) {
                    monthlyRevenue += parseFloat(p.amount) / 100;
                }
            });
        });

        const analytics = {
            totalUsers: allUsers.length,
            activeUsers: allUsers.filter(u => u.platformStatus === 'ACTIVE').length,
            monthlyRevenue: Math.round(monthlyRevenue),
            renewalDueUsers: allUsers.filter(u => u.clientSubscriptions.some(s => {
                const days = (new Date(s.endDate) - new Date()) / (1000 * 60 * 60 * 24);
                return s.status === 'ACTIVE' && days <= 7;
            })).length
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
                        amount: amountReceived ? Math.round(parseFloat(amountReceived) * 100) : plan.price,
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

        // Perform a cascading delete via transaction
        await prisma.$transaction([
            prisma.systemPayment.deleteMany({ where: { userId: id } }),
            prisma.clientSubscription.deleteMany({ where: { userId: id } }),
            prisma.storeNotification.deleteMany({ where: { userId: id } }),
            prisma.user.delete({ where: { id } })
        ]);

        res.json({ success: true, message: 'User and all associated data permanently deleted' });
    } catch (error) { 
        console.error('Hard delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to permanently delete user. They may have active sales or ledger records that prevent deletion.' });
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
