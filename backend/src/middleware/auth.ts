import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../services/authService.js';
import { logger } from '../utils/logger.js';
import { resolveUserPermission, RepoPermission, getRepoById } from '../services/repoService.js';
import { ensureDefaultBranch } from '../services/gitService.js';
import { verifyRepoToken } from '../services/repoTokenService.js';
import type { RepoAccessToken } from '../types/domain.js';
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

const permissionOrder: RepoPermission[] = ['none', 'read', 'write', 'owner'];

interface RepoAccessOptions {
  allowToken?: boolean;
  requireUser?: boolean;
}

export type RepoActor = { type: 'user'; userId: string } | { type: 'token'; token: RepoAccessToken };

function comparePermission(left: RepoPermission, right: RepoPermission): number {
  return permissionOrder.indexOf(left) - permissionOrder.indexOf(right);
}

function extractRepoToken(req: Request): string | null {
  const header = req.header('x-repo-token');
  if (header && header.trim().length > 0) {
    return header.trim();
  }
  const authHeader = req.header('authorization');
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() === 'token' && token) {
    return token.trim();
  }
  return null;
}

export function requireRepoPermission(permission: RepoPermission, options: RepoAccessOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { repoId } = req.params as { repoId: string };
    const descriptor = await getRepoById(repoId);
    if (!descriptor) {
      res.status(404).json({ message: 'Repository not found' });
      return;
    }
    const userId = req.user?.id ?? null;
    const userPermission = resolveUserPermission(userId, descriptor.metadata);

    let tokenSummary: RepoAccessToken | null = null;
    let tokenPermission: RepoPermission = 'none';
    if (options.allowToken) {
      const tokenValue = extractRepoToken(req);
      if (tokenValue) {
        tokenSummary = await verifyRepoToken(descriptor.metadata, descriptor.dir, tokenValue);
        if (tokenSummary) {
          tokenPermission = tokenSummary.permission;
        }
      }
    }

    let actor: RepoActor | null = null;
    let effective: RepoPermission = userPermission;

    if (options.requireUser) {
      if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      if (comparePermission(userPermission, permission) < 0) {
        res.status(403).json({ message: 'Insufficient repository permissions' });
        return;
      }
      actor = { type: 'user', userId: req.user.id };
      effective = userPermission;
    } else {
      if (req.user && comparePermission(userPermission, permission) >= 0) {
        actor = { type: 'user', userId: req.user.id };
        effective = userPermission;
      } else if (tokenSummary && comparePermission(tokenPermission, permission) >= 0) {
        actor = { type: 'token', token: tokenSummary };
        effective = tokenPermission;
      } else if (comparePermission(userPermission, permission) >= 0) {
        effective = userPermission;
      } else {
        res.status(403).json({ message: 'Insufficient repository permissions' });
        return;
      }
    }

    await ensureDefaultBranch(descriptor.metadata, descriptor.dir);
    res.locals.repo = descriptor;
    res.locals.repoAccess = {
      actor,
      permission: effective,
      userPermission,
      tokenPermission,
      token: tokenSummary ?? undefined
    };
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
