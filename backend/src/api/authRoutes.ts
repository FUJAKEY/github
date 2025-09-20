import { Router } from 'express';
import { z } from 'zod';

import { authenticateUser, issueTokenPair, decodeRefreshToken, verifyRefreshToken, revokeRefreshToken } from '../services/authService.js';
import { createUser, sanitizeUser, findUserById } from '../services/userService.js';
import { logAudit } from '../services/auditService.js';
import { clearAuthCookies, getRefreshToken, setAuthCookies } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await createUser({ ...input, role: 'user' });
    const tokens = await issueTokenPair(user);
    setAuthCookies(res, tokens);
    await logAudit({
      type: 'auth.register',
      actorId: user.id,
      metadata: { email: user.email }
    });
    res.status(201).json({ user: sanitizeUser(user), tokens: { accessExp: tokens.accessExp, refreshExp: tokens.refreshExp } });
  } catch (error) {
    next(error);
  }
});

const loginSchema = registerSchema;

router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await authenticateUser(input);
    const tokens = await issueTokenPair(user);
    setAuthCookies(res, tokens);
    await logAudit({
      type: 'auth.login',
      actorId: user.id,
      metadata: { email: user.email }
    });
    res.json({ user: sanitizeUser(user), tokens: { accessExp: tokens.accessExp, refreshExp: tokens.refreshExp } });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = getRefreshToken(req);
    if (!refreshToken) {
      res.status(401).json({ message: 'Refresh token missing' });
      return;
    }
    const decoded = decodeRefreshToken(refreshToken);
    const stored = await verifyRefreshToken(decoded.jti);
    if (!stored) {
      res.status(401).json({ message: 'Refresh token revoked' });
      return;
    }
    const user = await findUserById(stored.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    await revokeRefreshToken(decoded.jti);
    const tokens = await issueTokenPair(user);
    setAuthCookies(res, tokens);
    res.json({ user: sanitizeUser(user), tokens: { accessExp: tokens.accessExp, refreshExp: tokens.refreshExp } });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = getRefreshToken(req);
    if (refreshToken) {
      try {
        const decoded = decodeRefreshToken(refreshToken);
        await revokeRefreshToken(decoded.jti);
      } catch (error) {
        // ignore invalid tokens
      }
    }
    clearAuthCookies(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
