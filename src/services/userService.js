// ============================================
// User Management Service
// ============================================

import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import config from '../config/index.js';
import { parsePagination } from '../utils/helpers.js';

class UserService {
    async getAll(query = {}) {
        const { skip, limit, page } = parsePagination(query);

        const where = {};
        if (query.role) where.role = query.role;
        if (query.storeId) where.storeId = query.storeId;
        if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

        if (query.search) {
            where.OR = [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    storeId: true,
                    store: { select: { id: true, name: true } },
                    createdAt: true,
                },
            }),
            prisma.user.count({ where }),
        ]);

        return { users, pagination: { page, limit, total } };
    }

    async getById(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                isActive: true,
                storeId: true,
                store: { select: { id: true, name: true } },
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw { statusCode: 404, message: 'User not found' };
        }

        return user;
    }

    async update(id, data) {
        return prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                isActive: true,
                storeId: true,
                store: { select: { id: true, name: true } },
            },
        });
    }

    async delete(id) {
        return prisma.user.update({
            where: { id },
            data: { isActive: false },
        });
    }

    async resetPassword(id, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, config.bcryptRounds);
        return prisma.user.update({
            where: { id },
            data: { password: hashedPassword, refreshToken: null },
        });
    }
}

export default new UserService();
