import prisma from '../config/database.js';
import bcrypt from 'bcryptjs';

// Get all employees (excluding soft deleted)
export const getAllEmployees = async (req, res, next) => {
    try {
        const { role, state, status, search } = req.query;
        let where = { isDeleted: false };
        
        if (role && role !== 'All Roles') where.role = role;
        if (state && state !== 'All States') where.state = state;
        if (status) {
            if (status === 'Active') where.isActive = true;
            if (status === 'Inactive') where.isActive = false;
        }
        
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const employees = await prisma.employee.findMany({
            where,
            include: {
                manager: {
                    select: { id: true, name: true, role: true }
                },
                assignedUsers: {
                    select: {
                        clientSubscriptions: {
                            where: { status: 'ACTIVE' },
                            include: { plan: { select: { price: true } } }
                        }
                    }
                },
                _count: {
                    select: { assignedUsers: true, subordinates: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const employeesWithStats = employees.map(emp => {
            let totalSales = 0;
            if (emp.assignedUsers) {
                emp.assignedUsers.forEach(u => {
                    if (u.clientSubscriptions) {
                        u.clientSubscriptions.forEach(sub => {
                            if (sub.plan && sub.plan.price) {
                                totalSales += parseFloat(sub.plan.price);
                            }
                        });
                    }
                });
            }

            // Remove large associations to minimize payload
            const { assignedUsers, ...rest } = emp;

            let salesFormatted = '₹0';
            if (totalSales > 0) {
                if (totalSales >= 100000) {
                    salesFormatted = `₹${(totalSales / 100000).toFixed(1)}L`;
                } else if (totalSales >= 1000) {
                    salesFormatted = `₹${(totalSales / 1000).toFixed(1)}K`;
                } else {
                    salesFormatted = `₹${totalSales}`;
                }
            }

            return {
                ...rest,
                usersCount: rest._count.assignedUsers || 0,
                subordinatesCount: rest._count.subordinates || 0,
                salesFormatted,
                rawSalesValue: totalSales
            };
        });

        res.json({
            success: true,
            data: employeesWithStats
        });
    } catch (error) {
        next(error);
    }
};

// Get single employee
export const getEmployeeById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const employee = await prisma.employee.findUnique({
            where: { id, isDeleted: false },
            include: {
                manager: { select: { id: true, name: true, role: true } },
                subordinates: { select: { id: true, name: true, role: true, code: true } }
            }
        });

        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        res.json({ success: true, data: employee });
    } catch (error) {
        next(error);
    }
};

// Create a new employee
export const createEmployee = async (req, res, next) => {
    try {
        const { 
            name, email, phone, password, role, state, city, zone, 
            joiningDate, notes, targetAmount, salary, incentive, managerId 
        } = req.body;

        // Check email/phone existence
        const existing = await prisma.employee.findFirst({
            where: { OR: [{ email }, { phone }], isDeleted: false }
        });

        if (existing) {
            return res.status(400).json({ success: false, message: 'Email or Phone already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate a random code or sequential
        const count = await prisma.employee.count();
        const statePrefix = (state || 'HQ').substring(0, 2).toUpperCase();
        const code = `EMP-${statePrefix}-${String(count + 1).padStart(3, '0')}`;

        const newEmployee = await prisma.employee.create({
            data: {
                name, email, phone, password: hashedPassword, role,
                state, city, zone, notes, 
                joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
                targetAmount: targetAmount ? parseFloat(targetAmount) : null,
                salary: salary ? parseFloat(salary) : null,
                incentive: incentive ? parseFloat(incentive) : null,
                managerId: managerId || null,
                code
            }
        });

        const { password: _, ...empData } = newEmployee;
        res.status(201).json({ success: true, data: empData, message: 'Employee created successfully' });
    } catch (error) {
        next(error);
    }
};

// Update employee
export const updateEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { 
            name, phone, role, state, city, zone, 
            joiningDate, notes, targetAmount, salary, incentive, managerId, password
        } = req.body;

        const data = {
            name, phone, role, state, city, zone, notes,
            targetAmount: targetAmount ? parseFloat(targetAmount) : null,
            salary: salary ? parseFloat(salary) : null,
            incentive: incentive ? parseFloat(incentive) : null,
            managerId: managerId || null
        };

        if (joiningDate) data.joiningDate = new Date(joiningDate);
        if (password) data.password = await bcrypt.hash(password, 10);

        const updated = await prisma.employee.update({
            where: { id },
            data
        });

        const { password: _, ...empData } = updated;
        res.json({ success: true, data: empData, message: 'Employee updated successfully' });
    } catch (error) {
        next(error);
    }
};

// Toggle active status
export const toggleEmployeeStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const updated = await prisma.employee.update({
            where: { id },
            data: { isActive }
        });

        res.json({ success: true, data: updated, message: `Employee ${isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
        next(error);
    }
};

export const softDeleteEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.employee.update({
            where: { id },
            data: { isDeleted: true, isActive: false }
        });

        res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const getManagersList = async (req, res, next) => {
    try {
        const managers = await prisma.employee.findMany({
            where: { isDeleted: false, role: { in: ['TL', 'ASM', 'RH', 'BDE'] } },
            select: { id: true, name: true, role: true, code: true }
        });
        res.json({ success: true, data: managers });
    } catch (error) {
        next(error);
    }
};

export const exportEmployees = async (req, res, next) => {
    try {
        const emps = await prisma.employee.findMany({
            where: { isDeleted: false },
            include: { manager: true, subordinates: true, assignedUsers: true },
            orderBy: { createdAt: 'desc' }
        });

        const csv = 'Code,Name,Role,Email,Phone,State,City,Salary,ClientsCount,Manager\n' +
            emps.map(e => `"${e.code}","${e.name}","${e.role}","${e.email}","${e.phone || ''}","${e.state || ''}","${e.city || ''}","${e.salary || 0}","${e.assignedUsers.length}","${e.manager?.name || ''}"`).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=employees_export.csv');
        res.status(200).send(csv);
    } catch (error) { next(error); }
};
