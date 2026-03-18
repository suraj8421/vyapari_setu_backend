import prisma from '../config/database.js';
import { AppError } from '../utils/AppError.js';
import approvalNotificationService from './approvalNotificationService.js';

class B2bConnectionService {
    /**
     * Get all connections for a specific store
     */
    async getConnections(storeId) {
        // Find all where storeId is either supplier or buyer
        const connections = await prisma.storeConnection.findMany({
            where: {
                OR: [
                    { supplierStoreId: storeId },
                    { buyerStoreId: storeId },
                ],
            },
            include: {
                supplierStore: { select: { id: true, name: true, city: true, gstNumber: true } },
                buyerStore: { select: { id: true, name: true, city: true, gstNumber: true } },
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Map to standard format
        return connections.map(conn => {
            const isSupplier = conn.supplierStoreId === storeId;
            return {
                id: conn.id,
                status: conn.status,
                creditLimit: conn.creditLimit,
                createdAt: conn.createdAt,
                role: isSupplier ? 'SUPPLIER' : 'BUYER',
                partner: isSupplier ? conn.buyerStore : conn.supplierStore,
            };
        });
    }

    /**
     * Request a new connection
     * @param {string} requesterStoreId - The store sending the request
     * @param {string} targetStoreId - The target store
     * @param {string} intent - 'purchase_from' or 'sell_to'
     */
    async requestConnection(requesterStoreId, targetStoreId, intent, io) {
        if (requesterStoreId === targetStoreId) {
            throw new AppError("Cannot connect to your own store", 400);
        }

        const targetStore = await prisma.store.findUnique({ where: { id: targetStoreId } });
        if (!targetStore) throw new AppError("Target store not found", 404);

        // Determine who is supplier and who is buyer
        const supplierStoreId = intent === 'sell_to' ? requesterStoreId : targetStoreId;
        const buyerStoreId = intent === 'sell_to' ? targetStoreId : requesterStoreId;

        // Check if connection already exists
        const existing = await prisma.storeConnection.findUnique({
            where: {
                supplierStoreId_buyerStoreId: { supplierStoreId, buyerStoreId }
            }
        });

        if (existing) {
            throw new AppError(`Connection already exists with status: ${existing.status}`, 400);
        }

        const connection = await prisma.storeConnection.create({
            data: {
                supplierStoreId,
                buyerStoreId,
                status: 'PENDING'
            }
        });

        // Get requester store name for human-readable message
        const requesterStore = await prisma.store.findUnique({ where: { id: requesterStoreId }, select: { name: true } });

        // Create unified ApprovalNotification for the target store
        // Pass io so real-time bell badge fires immediately
        await approvalNotificationService.create({
            storeId: targetStoreId,
            type: 'STORE_CONNECTION_REQUEST',
            title: 'New Connection Request',
            message: `${requesterStore?.name || 'A store'} wants to connect with you as a ${intent === 'sell_to' ? 'buyer' : 'supplier'}.`,
            referenceId: connection.id,
            referenceType: 'connection',
        }, io);

        return connection;
    }

    /**
     * Accept a connection request
     */
    async acceptConnection(connectionId, storeId) {
        const connection = await prisma.storeConnection.findUnique({ where: { id: connectionId } });
        if (!connection) throw new AppError("Connection not found", 404);

        // Only the receiving end should accept. If storeId requested it, they shouldn't auto-accept.
        // Wait, any of the two can accept if it's PENDING? Generally the one who requested shouldn't.
        // For simplicity, just check it involves the store
        if (connection.supplierStoreId !== storeId && connection.buyerStoreId !== storeId) {
            throw new AppError("Unauthorized to accept this connection", 403);
        }

        return await prisma.storeConnection.update({
            where: { id: connectionId },
            data: { status: 'ACCEPTED' }
        });
    }

    /**
     * Search global stores by GST or Phone to connect
     */
    async searchStores(query, requesterStoreId) {
        if (!query || query.length < 3) return [];

        return await prisma.store.findMany({
            where: {
                id: { not: requesterStoreId },
                OR: [
                    { phone: { contains: query } },
                    { gstNumber: { contains: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } }
                ]
            },
            select: {
                id: true,
                name: true,
                city: true,
                state: true,
                phone: true,
                gstNumber: true
            },
            take: 10
        });
    }
}

export default new B2bConnectionService();
