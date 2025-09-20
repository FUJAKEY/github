import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('8000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  ACCESS_TOKEN_TTL: z.string().default('900'),
  REFRESH_TOKEN_TTL: z.string().default('604800'),
  REPOS_ROOT: z.string().default('./data')
});

const optionalJwtSchema = envSchema.extend({
  JWT_SECRET: envSchema.shape.JWT_SECRET.optional()
});

const parsedWithOptionalSecret = optionalJwtSchema.safeParse(process.env);

if (!parsedWithOptionalSecret.success) {
  console.error('Environment validation error', parsedWithOptionalSecret.error.format());
  throw new Error('Invalid environment variables');
}

function loadOrCreateJwtSecret(reposRoot: string, provided?: string): string {
  if (provided && provided.trim().length >= 32) {
    return provided.trim();
  }

  const secretFile = path.join(reposRoot, 'auth', 'jwt-secret');

  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  } catch (error) {
    // Ignore and generate a new secret below.
  }

  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  const secret = crypto.randomBytes(48).toString('hex');
  const tmpPath = `${secretFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, secret, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, secretFile);
  return secret;
}

const withSecret = {
  ...parsedWithOptionalSecret.data,
  JWT_SECRET: loadOrCreateJwtSecret(
    parsedWithOptionalSecret.data.REPOS_ROOT ?? './data',
    parsedWithOptionalSecret.data.JWT_SECRET
  )
};

const finalEnv = envSchema.safeParse(withSecret);

if (!finalEnv.success) {
  console.error('Environment validation error', finalEnv.error.format());
  throw new Error('Invalid environment variables');
}

process.env.JWT_SECRET = finalEnv.data.JWT_SECRET;

export const appEnv = {
  nodeEnv: finalEnv.data.NODE_ENV,
  port: Number(finalEnv.data.PORT),
  frontendUrl: finalEnv.data.FRONTEND_URL,
  jwtSecret: finalEnv.data.JWT_SECRET,
  accessTokenTtlSeconds: Number(finalEnv.data.ACCESS_TOKEN_TTL),
  refreshTokenTtlSeconds: Number(finalEnv.data.REFRESH_TOKEN_TTL),
  reposRoot: finalEnv.data.REPOS_ROOT
};
