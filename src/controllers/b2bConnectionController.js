import b2bConnectionService from '../services/b2bConnectionService.js';
import { success } from '../utils/response.js';

class B2bConnectionController {
    async requestConnection(req, res, next) {
        try {
            const { targetStoreId, intent } = req.body;
            const requesterStoreId = req.user.storeId;
            const io = req.app.locals.io;
            // Pass io so the service can emit notification_created to the target store
            const connection = await b2bConnectionService.requestConnection(requesterStoreId, targetStoreId, intent, io);
            return success(res, connection, 'Connection requested successfully');
        } catch (err) {
            next(err);
        }
    }

    async acceptConnection(req, res, next) {
        try {
            const { connectionId } = req.params;
            const storeId = req.user.storeId;
            const connection = await b2bConnectionService.acceptConnection(connectionId, storeId);
            return success(res, connection, 'Connection accepted');
        } catch (err) {
            next(err);
        }
    }

    async getConnections(req, res, next) {
        try {
            const storeId = req.user.storeId;
            const connections = await b2bConnectionService.getConnections(storeId);
            return success(res, connections, 'Connections fetched successfully');
        } catch (err) {
            next(err);
        }
    }

    async searchStores(req, res, next) {
        try {
            const { q } = req.query;
            const storeId = req.user.storeId;
            const stores = await b2bConnectionService.searchStores(q, storeId);
            return success(res, stores, 'Stores fetched successfully');
        } catch (err) {
            next(err);
        }
    }
}

export default new B2bConnectionController();
