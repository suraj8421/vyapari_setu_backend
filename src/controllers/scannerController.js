// ============================================
// Scanner Controller
// ============================================

import scannerService from '../services/scannerService.js';
import { success, error } from '../utils/response.js';

const scannerController = {
    async scanBarcode(req, res, next) {
        try {
            const { barcode } = req.body;
            if (!barcode) return res.status(400).json({ success: false, message: 'Barcode is required' });

            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.body.storeId;
            if (!storeId && req.user.role !== 'ADMIN') {
                return res.status(400).json({ success: false, message: 'Store ID required' });
            }

            const product = await scannerService.lookupBarcode(barcode, storeId);

            return success(res, {
                matchFound: !!product,
                product
            }, 'Barcode scanned');
        } catch (err) {
            next(err);
        }
    },

    async processImage(req, res, next) {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: 'Image file required' });

            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.body.storeId;
            const result = await scannerService.processProductImage(req.file.buffer, req.file.mimetype, storeId);

            return success(res, result, 'Image processed successfully');
        } catch (err) {
            next(err);
        }
    },

    async processDocument(req, res, next) {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: 'Document file required' });

            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.body.storeId;
            const result = await scannerService.processDocument(req.file.buffer, req.file.mimetype, storeId);

            return success(res, result, 'Document processed successfully');
        } catch (err) {
            next(err);
        }
    }
};

export default scannerController;
