import prisma from '../config/database.js';

export const getAllLeads = async (req, res, next) => {
    try {
        const { search, status, agentId, page = 1, limit = 50 } = req.query;
        let where = {};

        if (status && status !== 'Pipeline: All') where.status = status;
        if (agentId && agentId !== 'Agent: All') where.assignedToId = agentId;
        if (search) {
            where.OR = [
                { businessName: { contains: search, mode: 'insensitive' } },
                { contactName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip,
                take: parseInt(limit),
                include: {
                    employee: { select: { id: true, name: true, role: true } }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.lead.count({ where })
        ]);

        res.json({ success: true, data: leads, pagination: { total, page, limit } });
    } catch (error) { next(error); }
};

export const getLeadById = async (req, res, next) => {
    try {
        const lead = await prisma.lead.findUnique({
            where: { id: req.params.id },
            include: { employee: true }
        });
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
        res.json({ success: true, data: lead });
    } catch (error) { next(error); }
};

export const createLead = async (req, res, next) => {
    try {
        const { businessName, contactName, phone, email, source, status, assignedToId } = req.body;
        const lead = await prisma.lead.create({
            data: { 
                businessName, 
                contactName, 
                phone, 
                email, 
                source, 
                status, 
                assignedToId: assignedToId === "" ? null : assignedToId 
            }
        });
        req.app.locals.io?.emit('leads_updated'); // Notify for real-time sidebar refresh
        res.status(201).json({ success: true, data: lead });
    } catch (error) { next(error); }
};

export const updateLead = async (req, res, next) => {
    try {
        const { businessName, contactName, phone, email, source, status, assignedToId } = req.body;
        const lead = await prisma.lead.update({
            where: { id: req.params.id },
            data: { 
                businessName, 
                contactName, 
                phone, 
                email, 
                source, 
                status, 
                assignedToId: assignedToId === "" ? null : assignedToId 
            }
        });
        req.app.locals.io?.emit('leads_updated'); // Notify for real-time sidebar refresh
        res.json({ success: true, data: lead });
    } catch (error) { next(error); }
};

export const deleteLead = async (req, res, next) => {
    try {
        await prisma.lead.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Lead deleted' });
    } catch (error) { next(error); }
};

export const exportLeads = async (req, res, next) => {
    try {
        const leads = await prisma.lead.findMany({
            include: { employee: true },
            orderBy: { createdAt: 'desc' }
        });

        const csv = 'Date,Business,Contact,Phone,Email,Source,Status,AssignedAgent\n' +
            leads.map(l => `"${l.createdAt.toLocaleDateString()}","${l.businessName}","${l.contactName}","${l.phone}","${l.email || ''}","${l.source || ''}","${l.status}","${l.employee?.name || ''}"`).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
        res.status(200).send(csv);
    } catch (error) { next(error); }
};
