import prisma from '../config/database.js';

export const createOnboarding = async (req, res, next) => {
    try {
        const { businessCode, reviewLink, ...data } = req.body;
        
        const newOnboarding = await prisma.onboarding.create({
            data: data
        });

        res.status(201).json({ success: true, data: newOnboarding });
    } catch (error) {
        next(error);
    }
};

export const updateOnboarding = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { businessCode, reviewLink, ...data } = req.body;
        
        const updated = await prisma.onboarding.update({
            where: { id },
            data: data
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

export const getAllOnboardings = async (req, res, next) => {
    try {
        const { status, search } = req.query;
        let where = {};
        
        if (status && status !== 'All Status') where.status = status;
        if (search) {
            where.OR = [
                { businessName: { contains: search, mode: 'insensitive' } },
                { ownerName: { contains: search, mode: 'insensitive' } },
                { phoneNumber: { contains: search, mode: 'insensitive' } }
            ];
        }

        const onboardings = await prisma.onboarding.findMany({
            where,
            include: {
                plan: true,
                collectedBy: { select: { name: true, role: true, code: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: onboardings });
    } catch (error) {
        next(error);
    }
};

export const getOnboardingById = async (req, res, next) => {
    try {
        const onboarding = await prisma.onboarding.findUnique({
            where: { id: req.params.id },
            include: {
                plan: true,
                collectedBy: { select: { id: true, name: true, role: true, code: true } }
            }
        });
        if (!onboarding) return res.status(404).json({ success: false, message: 'Onboarding not found' });
        res.json({ success: true, data: onboarding });
    } catch (error) {
        next(error);
    }
};

export const deleteOnboarding = async (req, res, next) => {
    try {
        await prisma.onboarding.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Onboarding deleted' });
    } catch (error) {
        next(error);
    }
};
