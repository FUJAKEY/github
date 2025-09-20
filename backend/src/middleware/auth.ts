import type { Request, Response, NextFunction } from 'express';

import { verifyAccessToken } from '../services/authService.js';
import { verifyAccountToken } from '../services/accountTokenService.js';
import { logger } from '../utils/logger.js';
import { resolveUserPermission, RepoPermission, getRepoById } from '../services/repoService.js';
import { ensureDefaultBranch } from '../services/gitService.js';
import type { AccountAccessToken } from '../types/domain.js';
import { setRequestUser } from '../utils/locks.js';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.locals.apiToken = undefined;
  try {
    const token = req.cookies?.[ACCESS_COOKIE] || extractBearerToken(req.headers.authorization);
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

    if (!req.user) {
      const apiTokenValue = extractApiToken(req);
      if (apiTokenValue) {
        const verification = await verifyAccountToken(apiTokenValue);
        if (verification) {
          req.user = { id: verification.user.id, role: verification.user.role };
          res.locals.apiToken = verification.token;
          setRequestUser(verification.user.id);
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to attach user context');
  } finally {
    next();
  }
}

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  return token ?? null;
}

function extractApiToken(req: Request): string | null {
  const headerCandidates = ['x-account-token', 'x-api-token', 'x-repo-token'];
  for (const header of headerCandidates) {
    const value = req.header(header);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
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
  requireUser?: boolean;
}

export type RepoActor =
  | { type: 'user'; userId: string }
  | { type: 'token'; userId: string; token: AccountAccessToken };

function comparePermission(left: RepoPermission, right: RepoPermission): number {
  return permissionOrder.indexOf(left) - permissionOrder.indexOf(right);
}

export function requireRepoPermission(permission: RepoPermission, options: RepoAccessOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { repoId } = req.params as { repoId: string };
    const descriptor = await getRepoById(repoId);
    if (!descriptor) {
      res.status(404).json({ message: 'Repository not found' });
      return;
    }

    const apiToken: AccountAccessToken | undefined = res.locals.apiToken;
    let userPermission = resolveUserPermission(req.user?.id ?? null, descriptor.metadata);
    const tokenPermission: RepoPermission = apiToken ? (apiToken.permission === 'write' ? 'write' : 'read') : 'none';

    if (apiToken && comparePermission(userPermission, tokenPermission) > 0) {
      userPermission = tokenPermission;
    }

    let actor: RepoActor | null = null;
    let effective: RepoPermission = userPermission;

    if (options.requireUser) {
      if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      if (comparePermission(effective, permission) < 0) {
        res.status(403).json({ message: 'Insufficient repository permissions' });
        return;
      }
      actor = apiToken ? { type: 'token', userId: req.user.id, token: apiToken } : { type: 'user', userId: req.user.id };
    } else {
      if (req.user && comparePermission(effective, permission) >= 0) {
        actor = apiToken ? { type: 'token', userId: req.user.id, token: apiToken } : { type: 'user', userId: req.user.id };
      } else if (comparePermission(userPermission, permission) >= 0) {
        effective = userPermission;
        actor = null;
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
      token: apiToken
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
