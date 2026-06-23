import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { 
    getAllLeads, getLeadById, createLead, updateLead, deleteLead, exportLeads
} from '../controllers/saLeadController.js';

const router = express.Router();

// All SA lead routes require a valid SUPERADMIN token
router.use(authenticate, authorize('SUPERADMIN'));

router.get('/export', exportLeads);
router.get('/', getAllLeads);
router.get('/:id', getLeadById);
router.post('/', createLead);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;

