import express from 'express';
import { 
    getAllEmployees, 
    getEmployeeById, 
    createEmployee, 
    updateEmployee, 
    toggleEmployeeStatus, 
    softDeleteEmployee,
    getManagersList,
    exportEmployees
} from '../controllers/employeeController.js';

const router = express.Router();

router.get('/export', exportEmployees);
router.get('/', getAllEmployees);
router.get('/managers', getManagersList);
router.get('/:id', getEmployeeById);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.patch('/:id/status', toggleEmployeeStatus);
router.delete('/:id', softDeleteEmployee);

export default router;
