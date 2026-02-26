// ============================================
// Transaction Controller
// ============================================

import transactionService from '../services/transactionService.js';
import prisma from '../config/database.js';

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
            res.status(200).json({
                success: true,
                data: logs
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * Admin approve a pending edit
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
}

export default new TransactionController();
