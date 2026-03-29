import express from 'express';
import { createOnboarding, updateOnboarding, getAllOnboardings, getOnboardingById, deleteOnboarding } from '../controllers/onboardingController.js';

const router = express.Router();

router.get('/', getAllOnboardings);
router.post('/', createOnboarding);
router.get('/:id', getOnboardingById);
router.put('/:id', updateOnboarding);
router.delete('/:id', deleteOnboarding);

export default router;
