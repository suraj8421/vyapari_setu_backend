import express from 'express';
import { 
    getAllLeads, getLeadById, createLead, updateLead, deleteLead, exportLeads
} from '../controllers/saLeadController.js';

const router = express.Router();

router.get('/export', exportLeads);
router.get('/', getAllLeads);
router.get('/:id', getLeadById);
router.post('/', createLead);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;
