import express from 'express';
import { getMyInviteEligibility, getMyProfile, updateMyProfile } from '../controllers/user.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/me', verifyToken, getMyProfile);
router.patch('/me', verifyToken, updateMyProfile);
router.get('/me/invite-eligibility', verifyToken, getMyInviteEligibility);

export default router;
