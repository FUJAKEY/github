import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { findUserById, sanitizeUser } from '../services/userService.js';

const router = Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

export default router;
