import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { init as gitInit, add as gitAdd, commit as gitCommit } from 'isomorphic-git';
import { z } from 'zod';

import { appEnv } from '../config/env.js';
import { RepoCollaborator, RepoMetadata } from '../types/domain.js';
import { ensureDir, pathExists, writeJsonFile } from '../utils/fs.js';
import { slugify } from '../utils/slugify.js';
import { withRepoLock } from '../utils/locks.js';

import { logAudit } from './auditService.js';

const reposRoot = path.join(appEnv.reposRoot, 'repos');
const repoJsonName = 'repo.json';

const createRepoSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  private: z.boolean().default(false)
});

const updateRepoSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  private: z.boolean().optional()
});

export type CreateRepoInput = z.infer<typeof createRepoSchema>;
export type UpdateRepoInput = z.infer<typeof updateRepoSchema>;

interface RepoDescriptor {
  metadata: RepoMetadata;
  dir: string;
}

async function readRepoMetadata(repoDir: string): Promise<RepoMetadata> {
  const file = path.join(repoDir, repoJsonName);
  const content = await fsp.readFile(file, 'utf8');
  return JSON.parse(content) as RepoMetadata;
}

export async function listAllRepos(): Promise<RepoDescriptor[]> {
  if (!(await pathExists(reposRoot))) {
    return [];
  }
  const owners = await fsp.readdir(reposRoot);
  const result: RepoDescriptor[] = [];
  for (const owner of owners) {
    const ownerDir = path.join(reposRoot, owner);
    const stats = await fsp.stat(ownerDir);
    if (!stats.isDirectory()) continue;
    const repos = await fsp.readdir(ownerDir);
    for (const repoFolder of repos) {
      const repoDir = path.join(ownerDir, repoFolder);
      const repoStats = await fsp.stat(repoDir);
      if (!repoStats.isDirectory()) continue;
      const metadata = await readRepoMetadata(repoDir);
      result.push({ metadata, dir: repoDir });
    }
  }
  return result;
}

export async function getRepoById(repoId: string): Promise<RepoDescriptor | undefined> {
  const repos = await listAllRepos();
  return repos.find((repo) => repo.metadata.id === repoId);
}

function getRepoDir(ownerId: string, slug: string): string {
  return path.join(reposRoot, ownerId, slug);
}

export interface CommitIdentity {
  name: string;
  email: string;
}

export async function createRepository(
  ownerId: string,
  input: CreateRepoInput,
  author?: CommitIdentity
): Promise<RepoMetadata> {
  const parsed = createRepoSchema.parse(input);
  const slug = slugify(parsed.name);
  const repoDir = getRepoDir(ownerId, slug);
  if (await pathExists(repoDir)) {
    throw new Error('Repository with the same name already exists for this owner');
  }
  await ensureDir(repoDir);
  await gitInit({ fs, dir: repoDir, defaultBranch: 'main' });

  const metadata: RepoMetadata = {
    id: randomUUID(),
    ownerId,
    name: parsed.name,
    slug,
    description: parsed.description,
    private: parsed.private,
    createdAt: new Date().toISOString(),
    defaultBranch: 'main',
    collaborators: [],
    inviteCode: randomUUID().replace(/-/g, '').slice(0, 12)
  };

  await writeJsonFile(path.join(repoDir, repoJsonName), metadata);

  const commitAuthor: CommitIdentity =
    author ?? {
      name: 'mini-github',
      email: 'noreply@mini-github.local'
    };

  const initialReadme = `# ${parsed.name}\n\nCreated with mini-github.\n`;
  const readmePath = path.join(repoDir, 'README.md');
  await fsp.writeFile(readmePath, initialReadme, 'utf8');
  await gitAdd({ fs, dir: repoDir, filepath: 'README.md' });
  await gitCommit({
    fs,
    dir: repoDir,
    message: 'Initial commit',
    author: commitAuthor,
    committer: commitAuthor
  });

  await logAudit({
    type: 'repo.created',
    actorId: ownerId,
    repoId: metadata.id,
    metadata: { name: metadata.name }
  });

  return metadata;
}

export interface ListRepoParams {
  ownerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  viewerId?: string | null;
}

export async function listRepositories(params: ListRepoParams = {}): Promise<{ items: RepoMetadata[]; total: number }> {
  const { ownerId, search, page = 1, pageSize = 20, viewerId } = params;
  const repos = await listAllRepos();
  let filtered = repos.map((repo) => repo.metadata);

  if (ownerId) {
    filtered = filtered.filter((repo) => repo.ownerId === ownerId);
  }

  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter((repo) => repo.name.toLowerCase().includes(term));
  }

  if (viewerId) {
    filtered = filtered.filter((repo) =>
      repo.ownerId === viewerId ||
      repo.collaborators.some((c) => c.userId === viewerId) ||
      !repo.private
    );
  } else {
    filtered = filtered.filter((repo) => !repo.private);
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return { items, total };
}

export async function updateRepositoryMetadata(repoId: string, input: UpdateRepoInput): Promise<RepoMetadata> {
  const parsed = updateRepoSchema.parse(input);
  const repo = await getRepoById(repoId);
  if (!repo) {
    throw new Error('Repository not found');
  }
  const result = await withRepoLock(repo.metadata.id, async () => {
    const updated: RepoMetadata = { ...repo.metadata, ...parsed };
    await writeJsonFile(path.join(repo.dir, repoJsonName), updated);
    return updated;
  });
  await logAudit({
    type: 'repo.updated',
    actorId: repo.metadata.ownerId,
    repoId,
    metadata: parsed
  });
  return result;
}

export async function deleteRepository(repoId: string): Promise<void> {
  const repo = await getRepoById(repoId);
  if (!repo) {
    throw new Error('Repository not found');
  }
  await withRepoLock(repo.metadata.id, async () => {
    await fsp.rm(repo.dir, { recursive: true, force: true });
  });
  await logAudit({
    type: 'repo.deleted',
    actorId: repo.metadata.ownerId,
    repoId
  });
}

export function getRepoKey(metadata: RepoMetadata): string {
  return `${metadata.ownerId}/${metadata.slug}`;
}

export type RepoPermission = 'owner' | 'write' | 'read' | 'none';

export function resolveUserPermission(userId: string | null, repo: RepoMetadata): RepoPermission {
  if (!userId) {
    return repo.private ? 'none' : 'read';
  }
  if (repo.ownerId === userId) {
    return 'owner';
  }
  const collaborator = repo.collaborators.find((col) => col.userId === userId);
  if (!collaborator) {
    return repo.private ? 'none' : 'read';
  }
  return collaborator.role === 'write' ? 'write' : 'read';
}

export async function addCollaborator(repoId: string, collaborator: RepoCollaborator): Promise<RepoMetadata> {
  const repo = await getRepoById(repoId);
  if (!repo) {
    throw new Error('Repository not found');
  }
  return withRepoLock(repo.metadata.id, async () => {
    const exists = repo.metadata.collaborators.some((c) => c.userId === collaborator.userId);
    if (!exists) {
      repo.metadata.collaborators.push(collaborator);
      await writeJsonFile(path.join(repo.dir, repoJsonName), repo.metadata);
    }
    return repo.metadata;
  });
}

export async function removeCollaborator(repoId: string, userId: string): Promise<RepoMetadata> {
  const repo = await getRepoById(repoId);
  if (!repo) {
    throw new Error('Repository not found');
  }
  return withRepoLock(repo.metadata.id, async () => {
    repo.metadata.collaborators = repo.metadata.collaborators.filter((col) => col.userId !== userId);
    await writeJsonFile(path.join(repo.dir, repoJsonName), repo.metadata);
    return repo.metadata;
  });
}

export function ensureWritePermission(permission: RepoPermission): void {
  if (permission === 'none' || permission === 'read') {
    throw new Error('Insufficient permissions');
  }
}

export function ensureReadPermission(permission: RepoPermission): void {
  if (permission === 'none') {
    throw new Error('Insufficient permissions');
  }
}

export function ensureOwner(permission: RepoPermission): void {
  if (permission !== 'owner') {
    throw new Error('Only repository owner can perform this action');
  }
}
