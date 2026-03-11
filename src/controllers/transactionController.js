// ============================================
// Transaction Controller
// ============================================

import transactionService from '../services/transactionService.js';
import { success } from '../utils/response.js';

class TransactionController {
    /**
     * Create any supported transaction entry
     */
    async create(req, res) {
        try {
            const result = await transactionService.create(req.body, req.user);
            res.status(201).json({
                success: true,
                message: 'Transaction recorded successfully',
                data: result
            });
        } catch (error) {
            console.error('Entry Error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Error recording transaction'
            });
        }
    }

    /**
     * Update an existing entry (Subject to Approval Workflow)
     */
    async update(req, res) {
        try {
            const { type, id } = req.params;
            const result = await transactionService.update(type, id, req.body, req.user);

            const message = req.user.role === 'ADMIN'
                ? 'Transaction updated successfully'
                : 'Edit request submitted for administrator approval';

            res.status(200).json({
                success: true,
                message,
                data: result
            });
        } catch (error) {
            console.error('Update Error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Error updating transaction'
            });
        }
    }

    /**
     * Get Audit Logs for a specific transaction
     */
    async getHistory(req, res) {
        try {
            const { type, id } = req.params;
            const logs = await transactionService.getHistory(type, id);
            res.status(200).json({ success: true, data: logs });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * Admin approves a pending edit
     */
    async approve(req, res) {
        try {
            const { logId } = req.params;
            const result = await transactionService.approveUpdate(logId, req.user.id);
            res.status(200).json({
                success: true,
                message: 'Changes approved and applied',
                data: result
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * FIX: Admin rejects a pending edit (was completely missing before).
     * Admins previously had no way to dismiss bad edit requests.
     */
    async reject(req, res) {
        try {
            const { logId } = req.params;
            const { notes } = req.body;
            const result = await transactionService.rejectUpdate(logId, req.user.id, notes);
            res.status(200).json({
                success: true,
                message: 'Edit request rejected',
                data: result
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * FIX: Get all PENDING approval requests (was completely missing before).
     * Admins had no API to discover what edits needed review.
     */
    async getPendingApprovals(req, res) {
        try {
            const storeId = req.user.role === 'STORE_USER' ? req.user.storeId : req.query.storeId || null;
            const list = await transactionService.getPendingApprovals(storeId);
            res.status(200).json({ success: true, data: list });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }
}

export default new TransactionController();
