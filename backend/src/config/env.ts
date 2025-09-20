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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation error', parsed.error.format());
  throw new Error('Invalid environment variables');
}

export const appEnv = {
  nodeEnv: parsed.data.NODE_ENV,
  port: Number(parsed.data.PORT),
  frontendUrl: parsed.data.FRONTEND_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  accessTokenTtlSeconds: Number(parsed.data.ACCESS_TOKEN_TTL),
  refreshTokenTtlSeconds: Number(parsed.data.REFRESH_TOKEN_TTL),
  reposRoot: parsed.data.REPOS_ROOT
};
