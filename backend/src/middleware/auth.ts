import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../services/authService.js';
import { logger } from '../utils/logger.js';
import { resolveUserPermission, RepoPermission, getRepoById } from '../services/repoService.js';
import { setRequestUser } from '../utils/locks.js';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

export function attachUser(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] || extractToken(req.headers.authorization);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.userId, role: payload.role };
      setRequestUser(payload.userId);
    } catch (error) {
      logger.warn({ error }, 'Invalid access token');
      req.user = undefined;
    }
  }
  next();
}

function extractToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  return token ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  };
}

export function requireRepoPermission(permission: RepoPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { repoId } = req.params as { repoId: string };
    const descriptor = await getRepoById(repoId);
    if (!descriptor) {
      res.status(404).json({ message: 'Repository not found' });
      return;
    }
    const userId = req.user?.id ?? null;
    const level = resolveUserPermission(userId, descriptor.metadata);
    const order: RepoPermission[] = ['none', 'read', 'write', 'owner'];
    if (order.indexOf(level) < order.indexOf(permission)) {
      res.status(403).json({ message: 'Insufficient repository permissions' });
      return;
    }
    res.locals.repo = descriptor;
    next();
  };
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptions());
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string; accessExp: number; refreshExp: number }): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOptions(),
    maxAge: Math.max(tokens.accessExp * 1000 - Date.now(), 0)
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOptions(),
    maxAge: Math.max(tokens.refreshExp * 1000 - Date.now(), 0)
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

export function getRefreshToken(req: Request): string | null {
  return req.cookies?.[REFRESH_COOKIE] ?? null;
}
