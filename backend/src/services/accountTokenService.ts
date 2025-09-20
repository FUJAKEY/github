import path from 'path';
import { randomBytes, randomUUID } from 'crypto';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { appEnv } from '../config/env.js';
import type { AccountAccessToken, AccountAccessTokenPermission, UserRecord } from '../types/domain.js';
import { readJsonFile, updateJsonFile } from '../utils/fs.js';

import { logAudit } from './auditService.js';
import { findUserById } from './userService.js';

const tokensFile = path.join(appEnv.reposRoot, 'users', 'api-tokens.json');

const tokenRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  permission: z.enum(['read', 'write']),
  tokenHash: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional()
});

const createTokenSchema = z.object({
  name: z.string().min(1).max(120),
  permission: z.enum(['read', 'write']).default('read')
});

type AccountTokenRecord = z.infer<typeof tokenRecordSchema>;

const fallbackTokens: AccountTokenRecord[] = [];

function sanitize(record: AccountTokenRecord): AccountAccessToken {
  const { tokenHash, ...rest } = record;
  void tokenHash;
  return rest;
}

function httpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

export async function listAccountTokens(userId: string): Promise<AccountAccessToken[]> {
  const tokens = await readJsonFile(tokensFile, fallbackTokens);
  return tokens.filter((token) => token.userId === userId).map(sanitize);
}

export async function createAccountToken(
  user: UserRecord,
  input: { name: string; permission: AccountAccessTokenPermission }
): Promise<{ token: AccountAccessToken; secret: string }> {
  const payload = createTokenSchema.parse(input);
  const secret = randomBytes(24).toString('hex');
  const tokenHash = await bcrypt.hash(secret, 12);
  const record: AccountTokenRecord = {
    id: randomUUID(),
    userId: user.id,
    name: payload.name,
    permission: payload.permission,
    tokenHash,
    createdAt: new Date().toISOString()
  };

  await updateJsonFile<AccountTokenRecord[]>(tokensFile, fallbackTokens, (tokens) => {
    tokens.push(record);
  });

  await logAudit({
    type: 'account.token.created',
    actorId: user.id,
    metadata: { tokenId: record.id, permission: record.permission }
  });

  return { token: sanitize(record), secret: `${record.id}.${secret}` };
}

export async function deleteAccountToken(userId: string, tokenId: string): Promise<void> {
  let removed = false;
  await updateJsonFile<AccountTokenRecord[]>(tokensFile, fallbackTokens, (tokens) => {
    const index = tokens.findIndex((token) => token.userId === userId && token.id === tokenId);
    if (index !== -1) {
      tokens.splice(index, 1);
      removed = true;
    }
  });
  if (!removed) {
    throw httpError(404, 'Token not found');
  }
  await logAudit({
    type: 'account.token.deleted',
    actorId: userId,
    metadata: { tokenId }
  });
}

export async function verifyAccountToken(
  tokenValue: string
): Promise<{ token: AccountAccessToken; user: UserRecord } | null> {
  const [tokenId, rawSecret] = tokenValue.split('.');
  if (!tokenId || !rawSecret) {
    return null;
  }

  const tokens = await readJsonFile(tokensFile, fallbackTokens);
  const record = tokens.find((token) => token.id === tokenId);
  if (!record) {
    return null;
  }

  const matches = await bcrypt.compare(rawSecret, record.tokenHash);
  if (!matches) {
    return null;
  }

  const user = await findUserById(record.userId);
  if (!user) {
    return null;
  }

  const updated: AccountTokenRecord = { ...record, lastUsedAt: new Date().toISOString() };
  await updateJsonFile<AccountTokenRecord[]>(tokensFile, fallbackTokens, (entries) => {
    const index = entries.findIndex((token) => token.id === record.id);
    if (index !== -1) {
      entries[index] = updated;
    }
  });

  return { token: sanitize(updated), user };
}
