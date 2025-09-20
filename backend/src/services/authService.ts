import path from 'path';
import { randomUUID } from 'crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { appEnv } from '../config/env.js';
import { RefreshTokenRecord, UserRecord } from '../types/domain.js';
import { readJsonFile, updateJsonFile } from '../utils/fs.js';

import { findUserByEmail } from './userService.js';

const refreshTokensFile = path.join(appEnv.reposRoot, 'auth', 'refresh-tokens.json');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  accessExp: number;
  refreshExp: number;
}

function signAccessToken(user: UserRecord): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + appEnv.accessTokenTtlSeconds;
  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      exp
    },
    appEnv.jwtSecret
  );
  return { token, exp };
}

function signRefreshToken(user: UserRecord, jti: string): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + appEnv.refreshTokenTtlSeconds;
  const token = jwt.sign(
    {
      sub: user.id,
      jti,
      exp
    },
    appEnv.jwtSecret
  );
  return { token, exp };
}

export async function authenticateUser(input: LoginInput): Promise<UserRecord> {
  const parsed = loginSchema.parse(input);
  const user = await findUserByEmail(parsed.email);
  if (!user) {
    throw new Error('Invalid credentials');
  }
  const ok = await bcrypt.compare(parsed.password, user.passwordHash);
  if (!ok) {
    throw new Error('Invalid credentials');
  }
  return user;
}

export async function registerRefreshToken(userId: string, jti: string, exp: number): Promise<void> {
  await updateJsonFile<RefreshTokenRecord[]>(refreshTokensFile, [], (tokens) => {
    tokens.push({ jti, userId, exp, createdAt: new Date().toISOString() });
  });
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await updateJsonFile<RefreshTokenRecord[]>(refreshTokensFile, [], (tokens) => {
    const index = tokens.findIndex((token) => token.jti === jti);
    if (index >= 0) {
      tokens.splice(index, 1);
    }
  });
}

export async function verifyRefreshToken(jti: string): Promise<RefreshTokenRecord | undefined> {
  const tokens = await readJsonFile<RefreshTokenRecord[]>(refreshTokensFile, []);
  const token = tokens.find((record) => record.jti === jti);
  if (!token) {
    return undefined;
  }
  if (token.exp * 1000 < Date.now()) {
    await revokeRefreshToken(jti);
    return undefined;
  }
  return token;
}

export async function issueTokenPair(user: UserRecord): Promise<TokenPair> {
  const jti = randomUUID();
  const { token: accessToken, exp: accessExp } = signAccessToken(user);
  const { token: refreshToken, exp: refreshExp } = signRefreshToken(user, jti);
  await registerRefreshToken(user.id, jti, refreshExp);
  return { accessToken, refreshToken, refreshJti: jti, accessExp, refreshExp };
}

export function verifyAccessToken(token: string): { userId: string; role: string } {
  const payload = jwt.verify(token, appEnv.jwtSecret) as JwtPayload;
  return { userId: payload.sub as string, role: payload.role as string };
}

export function decodeRefreshToken(token: string): { userId: string; jti: string; exp: number } {
  const payload = jwt.verify(token, appEnv.jwtSecret) as JwtPayload;
  if (!payload.sub || !payload.jti || !payload.exp) {
    throw new Error('Invalid refresh token payload');
  }
  return { userId: payload.sub as string, jti: payload.jti as string, exp: payload.exp };
}
