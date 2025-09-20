/* eslint-disable import/order */
import path from 'path';
import { randomBytes, randomUUID } from 'crypto';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

// eslint-disable-next-line import/order
import type {
  RepoAccessToken,
  RepoAccessTokenPermission,
  RepoMetadata
} from '../types/domain.js';

import { readJsonFile, writeJsonFile } from '../utils/fs.js';
import { withRepoLock } from '../utils/locks.js';
import { logAudit } from './auditService.js';

const tokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  permission: z.enum(['read', 'write']),
  tokenHash: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional()
});

type RepoTokenRecord = z.infer<typeof tokenRecordSchema>;

const createTokenSchema = z.object({
  name: z.string().min(1).max(120),
  permission: z.enum(['read', 'write'])
});

const fallbackTokens: RepoTokenRecord[] = [];

function httpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function tokensPath(repoDir: string): string {
  return path.join(repoDir, 'tokens.json');
}

function sanitize(record: RepoTokenRecord): RepoAccessToken {
  const { tokenHash, ...rest } = record;
  void tokenHash;
  return rest;
}

export async function listRepoTokens(repo: RepoMetadata, repoDir: string): Promise<RepoAccessToken[]> {
  const tokens = await readJsonFile(tokensPath(repoDir), fallbackTokens);
  return tokens.map(sanitize);
}

export async function createRepoToken(
  repo: RepoMetadata,
  repoDir: string,
  input: { name: string; permission: RepoAccessTokenPermission },
  actorId: string | null
): Promise<{ token: RepoAccessToken; secret: string }> {
  const payload = createTokenSchema.parse(input);
  const secret = randomBytes(24).toString('hex');
  const id = randomUUID();

  const created = await withRepoLock(repo.id, async () => {
    const tokens = await readJsonFile(tokensPath(repoDir), fallbackTokens);
    const tokenHash = await bcrypt.hash(secret, 12);
    const record: RepoTokenRecord = {
      id,
      name: payload.name,
      permission: payload.permission,
      tokenHash,
      createdAt: new Date().toISOString()
    };
    tokens.push(record);
    await writeJsonFile(tokensPath(repoDir), tokens);
    await logAudit({
      type: 'repo.token.created',
      actorId,
      repoId: repo.id,
      metadata: { tokenId: id, permission: payload.permission }
    });
    return record;
  });

  return { token: sanitize(created), secret: `${id}.${secret}` };
}

export async function deleteRepoToken(
  repo: RepoMetadata,
  repoDir: string,
  tokenId: string,
  actorId: string | null
): Promise<void> {
  await withRepoLock(repo.id, async () => {
    const tokens = await readJsonFile(tokensPath(repoDir), fallbackTokens);
    const next = tokens.filter((token) => token.id !== tokenId);
    if (next.length === tokens.length) {
      throw httpError(404, 'Token not found');
    }
    await writeJsonFile(tokensPath(repoDir), next);
    await logAudit({
      type: 'repo.token.deleted',
      actorId,
      repoId: repo.id,
      metadata: { tokenId }
    });
  });
}

export async function verifyRepoToken(
  repo: RepoMetadata,
  repoDir: string,
  tokenValue: string
): Promise<RepoAccessToken | null> {
  const [tokenId, rawSecret] = tokenValue.split('.');
  if (!tokenId || !rawSecret) {
    return null;
  }

  const record = await withRepoLock(repo.id, async () => {
    const tokens = await readJsonFile(tokensPath(repoDir), fallbackTokens);
    const index = tokens.findIndex((token) => token.id === tokenId);
    if (index === -1) {
      return null;
    }

    const candidate = tokens[index];
    const matches = await bcrypt.compare(rawSecret, candidate.tokenHash);
    if (!matches) {
      return null;
    }

    const updated: RepoTokenRecord = {
      ...candidate,
      lastUsedAt: new Date().toISOString()
    };
    tokens[index] = updated;
    await writeJsonFile(tokensPath(repoDir), tokens);
    return updated;
  });

  return record ? sanitize(record) : null;
}
