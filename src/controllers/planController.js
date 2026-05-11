import prisma from '../config/database.js';

// Get all plans for public
export const getAllPlans = async (req, res, next) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' }
        });

        const formattedPlans = plans.map(plan => {
            const data = plan.features || {};
            return {
                _id: plan.id,
                name: plan.name,
                price: parseFloat(plan.price),
                durationMonths: plan.durationMonths,
                durationDays: data.durationDays || (plan.durationMonths * 30),
                type: data.type || 'normal',
                offerText: data.offerText || '',
                offerValidity: data.offerValidity || null,
                oldPrice: data.oldPrice || null,
                status: plan.isActive ? 'active' : 'inactive',
                features: data.list || []
            };
        });

        res.json({ success: true, data: formattedPlans });
    } catch (error) {
        next(error);
    }
};

// Get all plans for admin
export const getAllAdminPlans = async (req, res, next) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const formattedPlans = plans.map(plan => {
            const data = plan.features || {};
            return {
                _id: plan.id,
                name: plan.name,
                price: parseFloat(plan.price),
                durationMonths: plan.durationMonths,
                durationDays: data.durationDays || (plan.durationMonths * 30),
                type: data.type || 'normal',
                offerText: data.offerText || '',
                offerValidity: data.offerValidity || null,
                oldPrice: data.oldPrice || null,
                status: plan.isActive ? 'active' : 'inactive',
                features: data.list || []
            };
        });

        res.json({ success: true, data: formattedPlans });
    } catch (error) {
        next(error);
    }
};

// Create plan
export const createPlan = async (req, res, next) => {
    try {
        const { name, price, oldPrice, durationDays, type, offerText, offerValidity, status, features } = req.body;

        const durationMonths = Math.max(1, Math.round(durationDays / 30));

        const planData = {
            list: features || [],
            type: type || 'normal',
            offerText: offerText || '',
            offerValidity: offerValidity || null,
            oldPrice: oldPrice || null,
            durationDays: durationDays
        };

        const plan = await prisma.subscriptionPlan.create({
            data: {
                name,
                price: price,
                durationMonths,
                isActive: status === 'active',
                features: planData
            }
        });

        res.status(201).json({ success: true, data: plan, message: 'Plan created successfully' });
    } catch (error) {
        next(error);
    }
};

// Update plan
export const updatePlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, price, oldPrice, durationDays, type, offerText, offerValidity, status, features } = req.body;

        const durationMonths = Math.max(1, Math.round(durationDays / 30));

        const planData = {
            list: features || [],
            type: type || 'normal',
            offerText: offerText || '',
            offerValidity: offerValidity || null,
            oldPrice: oldPrice || null,
            durationDays: durationDays
        };

        const plan = await prisma.subscriptionPlan.update({
            where: { id },
            data: {
                name,
                price: price,
                durationMonths,
                isActive: status === 'active',
                features: planData
            }
        });

        res.json({ success: true, data: plan, message: 'Plan updated successfully' });
    } catch (error) {
        next(error);
    }
};

// Delete plan
export const deletePlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.subscriptionPlan.delete({ where: { id } });
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        next(error);
    }
};
