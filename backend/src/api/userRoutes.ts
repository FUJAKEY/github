import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { findUserById, sanitizeUser } from '../services/userService.js';
import {
  createAccountToken,
  deleteAccountToken,
  listAccountTokens
} from '../services/accountTokenService.js';

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

router.get('/me/tokens', requireAuth, async (req, res, next) => {
  try {
    const tokens = await listAccountTokens(req.user!.id);
    res.json({ tokens });
  } catch (error) {
    next(error);
  }
});

router.post('/me/tokens', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      permission: z.enum(['read', 'write']).default('read')
    });
    const input = schema.parse(req.body);
    const user = await findUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const result = await createAccountToken(user, input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/me/tokens/:tokenId', requireAuth, async (req, res, next) => {
  try {
    await deleteAccountToken(req.user!.id, req.params.tokenId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
