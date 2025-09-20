import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireRepoPermission } from '../middleware/auth.js';
import {
  createRepository,
  deleteRepository,
  getRepoById,
  listRepositories,
  updateRepositoryMetadata,
  resolveUserPermission,
  addCollaborator,
  removeCollaborator
} from '../services/repoService.js';
import {
  listBranches,
  createBranch,
  deleteBranch,
  checkoutBranch,
  listCommits,
  getDiffBetweenRefs,
  getTree,
  getFile,
  writeFileToRepo,
  deleteFileFromRepo,
  createFolder,
  streamArchive,
  getCurrentBranch
} from '../services/gitService.js';
import { findUserById } from '../services/userService.js';
import { logAudit } from '../services/auditService.js';
import {
  listRepoTokens,
  createRepoToken,
  deleteRepoToken
} from '../services/repoTokenService.js';
import type { RepoActor } from '../middleware/auth.js';
import type { RepoMetadata } from '../types/domain.js';
import type { RepoPermission } from '../services/repoService.js';

const router = Router();

const createRepoSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  private: z.boolean().optional()
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const input = createRepoSchema.parse(req.body);
    const owner = await findUserById(req.user!.id);
    if (!owner) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const metadata = await createRepository(
      req.user!.id,
      {
        name: input.name,
        description: input.description ?? '',
        private: input.private ?? false
      },
      {
        name: owner.email.split('@')[0],
        email: owner.email
      }
    );
    res.status(201).json({ repo: formatRepoResponse(metadata, 'owner') });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { owner, search, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const result = await listRepositories({
      ownerId: owner,
      search,
      page: Number(page),
      pageSize: Number(pageSize),
      viewerId: req.user?.id ?? null
    });
    res.json({
      items: result.items.map((repo) => formatRepoResponse(repo, resolveUserPermission(req.user?.id ?? null, repo))),
      total: result.total
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:repoId',
  requireRepoPermission('read', { allowToken: true }),
  (req, res) => {
    const descriptor = res.locals.repo!;
    const access = res.locals.repoAccess;
    const permission = access?.permission ?? resolveUserPermission(req.user?.id ?? null, descriptor.metadata);
    res.json({ repo: formatRepoResponse(descriptor.metadata, permission), permission });
  }
);

router.patch('/:repoId', requireAuth, requireRepoPermission('owner'), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      private: z.boolean().optional(),
      rotateInviteCode: z.boolean().optional()
    });
    const input = schema.parse(req.body);
    const repoDescriptor = res.locals.repo;
    if (!repoDescriptor) {
      res.status(404).json({ message: 'Repository not found' });
      return;
    }
    let metadata = await updateRepositoryMetadata(req.params.repoId, input);
    if (input.rotateInviteCode) {
      metadata = { ...metadata, inviteCode: randomUUID().replace(/-/g, '').slice(0, 12) };
    }
    res.json({ repo: formatRepoResponse(metadata, 'owner') });
  } catch (error) {
    next(error);
  }
});

router.delete('/:repoId', requireAuth, requireRepoPermission('owner'), async (req, res, next) => {
  try {
    await deleteRepository(req.params.repoId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/branches', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const repoDescriptor = res.locals.repo!;
    const current = await getCurrentBranch(repoDescriptor.dir);
    const branches = await listBranches(repoDescriptor.dir, current);
    res.json({ branches, current });
  } catch (error) {
    next(error);
  }
});

router.post('/:repoId/branches', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      from: z.string().optional()
    });
    const input = schema.parse(req.body);
    const repoDescriptor = res.locals.repo!;
    await createBranch(repoDescriptor.metadata, repoDescriptor.dir, input.name, input.from ?? repoDescriptor.metadata.defaultBranch);
    res.status(201).json({ message: 'Branch created' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:repoId/branches/:name', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const repoDescriptor = res.locals.repo!;
    await deleteBranch(repoDescriptor.metadata, repoDescriptor.dir, req.params.name);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:repoId/checkout', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const schema = z.object({ branch: z.string().min(1) });
    const input = schema.parse(req.body);
    const repoDescriptor = res.locals.repo!;
    await checkoutBranch(repoDescriptor.metadata, repoDescriptor.dir, input.branch);
    res.json({ message: 'Checked out', branch: input.branch });
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/commits', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const branch = (req.query.branch as string) ?? res.locals.repo!.metadata.defaultBranch;
    const commits = await listCommits(res.locals.repo!.dir, branch);
    res.json({ commits });
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/diff', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) {
      res.status(400).json({ message: 'from and to parameters are required' });
      return;
    }
    const diff = await getDiffBetweenRefs(res.locals.repo!.dir, from, to);
    res.json({ diff });
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/tree', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const branch = (req.query.branch as string) ?? res.locals.repo!.metadata.defaultBranch;
    const targetPath = (req.query.path as string) ?? '';
    const tree = await getTree(res.locals.repo!.dir, branch, targetPath);
    res.json({ tree });
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/file', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const branch = (req.query.branch as string) ?? res.locals.repo!.metadata.defaultBranch;
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ message: 'path parameter is required' });
      return;
    }
    const content = await getFile(res.locals.repo!.dir, branch, filePath);
    res.json({ path: filePath, content });
  } catch (error) {
    next(error);
  }
});

router.put('/:repoId/file', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const schema = z.object({
      path: z.string().min(1),
      content: z.string(),
      branch: z.string().min(1),
      message: z.string().min(1)
    });
    const input = schema.parse(req.body);
    const repoDescriptor = res.locals.repo!;
    const access = res.locals.repoAccess;
    const { identity, auditActorId } = await resolveCommitActor(access?.actor ?? null);
    await writeFileToRepo(repoDescriptor.metadata, repoDescriptor.dir, input.path, input.content, input.branch, {
      message: input.message,
      author: identity
    });
    await logAudit({
      type: 'repo.file.write',
      actorId: auditActorId,
      repoId: repoDescriptor.metadata.id,
      metadata: { path: input.path }
    });
    res.status(200).json({ message: 'File saved' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:repoId/file', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const branch = (req.query.branch as string) ?? res.locals.repo!.metadata.defaultBranch;
    const filePath = req.query.path as string;
    const message = (req.query.message as string) ?? 'Delete file';
    if (!filePath) {
      res.status(400).json({ message: 'path parameter is required' });
      return;
    }
    const access = res.locals.repoAccess;
    const { identity, auditActorId } = await resolveCommitActor(access?.actor ?? null);
    await deleteFileFromRepo(res.locals.repo!.metadata, res.locals.repo!.dir, filePath, branch, {
      message,
      author: identity
    });
    await logAudit({
      type: 'repo.file.deleted',
      actorId: auditActorId,
      repoId: res.locals.repo!.metadata.id,
      metadata: { path: filePath }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:repoId/folder', requireRepoPermission('write', { allowToken: true }), async (req, res, next) => {
  try {
    const schema = z.object({ path: z.string().min(1) });
    const input = schema.parse(req.body);
    await createFolder(res.locals.repo!.metadata, res.locals.repo!.dir, input.path);
    res.status(201).json({ message: 'Folder created' });
  } catch (error) {
    next(error);
  }
});

router.get('/:repoId/archive.zip', requireRepoPermission('read', { allowToken: true }), async (req, res, next) => {
  try {
    const branch = (req.query.branch as string) ?? res.locals.repo!.metadata.defaultBranch;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${res.locals.repo!.metadata.slug}-${branch}.zip"`);
    await streamArchive(res.locals.repo!.metadata, res.locals.repo!.dir, branch, res);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:repoId/tokens',
  requireAuth,
  requireRepoPermission('owner', { requireUser: true }),
  async (_req, res, next) => {
    try {
      const repoDescriptor = res.locals.repo!;
      const tokens = await listRepoTokens(repoDescriptor.metadata, repoDescriptor.dir);
      res.json({ tokens });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:repoId/tokens',
  requireAuth,
  requireRepoPermission('owner', { requireUser: true }),
  async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        permission: z.enum(['read', 'write']).default('read')
      });
      const input = schema.parse(req.body);
      const repoDescriptor = res.locals.repo!;
      const { token, secret } = await createRepoToken(
        repoDescriptor.metadata,
        repoDescriptor.dir,
        input,
        req.user!.id
      );
      res.status(201).json({ token, secret });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:repoId/tokens/:tokenId',
  requireAuth,
  requireRepoPermission('owner', { requireUser: true }),
  async (req, res, next) => {
    try {
      const repoDescriptor = res.locals.repo!;
      await deleteRepoToken(repoDescriptor.metadata, repoDescriptor.dir, req.params.tokenId, req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:repoId/collaborators', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      userId: z.string().optional(),
      role: z.enum(['read', 'write']).optional(),
      inviteCode: z.string().optional()
    });
    const input = schema.parse(req.body);
    const repoDescriptor = await getRepoById(req.params.repoId);
    if (!repoDescriptor) {
      res.status(404).json({ message: 'Repository not found' });
      return;
    }
    const permission = resolveUserPermission(req.user!.id, repoDescriptor.metadata);
    if (input.userId && (permission === 'owner')) {
      const collaboratorUser = await findUserById(input.userId);
      if (!collaboratorUser) {
        res.status(404).json({ message: 'Collaborator not found' });
        return;
      }
      const updated = await addCollaborator(repoDescriptor.metadata.id, {
        userId: input.userId,
        role: input.role ?? 'read',
        invitedAt: new Date().toISOString()
      });
      await logAudit({
        type: 'repo.collaborator.added',
        actorId: req.user!.id,
        repoId: repoDescriptor.metadata.id,
        metadata: { userId: input.userId }
      });
      res.status(201).json({ repo: formatRepoResponse(updated, permission) });
      return;
    }
    if (input.inviteCode && input.inviteCode === repoDescriptor.metadata.inviteCode) {
      const updated = await addCollaborator(repoDescriptor.metadata.id, {
        userId: req.user!.id,
        role: 'write',
        invitedAt: new Date().toISOString()
      });
      await logAudit({
        type: 'repo.collaborator.joined',
        actorId: req.user!.id,
        repoId: repoDescriptor.metadata.id
      });
      res.status(201).json({ repo: formatRepoResponse(updated, resolveUserPermission(req.user!.id, updated)) });
      return;
    }
    res.status(403).json({ message: 'Invalid collaborator request' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:repoId/collaborators/:userId', requireAuth, requireRepoPermission('owner'), async (req, res, next) => {
  try {
    const metadata = await removeCollaborator(req.params.repoId, req.params.userId);
    await logAudit({
      type: 'repo.collaborator.removed',
      actorId: req.user!.id,
      repoId: metadata.id,
      metadata: { userId: req.params.userId }
    });
    res.status(200).json({ repo: formatRepoResponse(metadata, 'owner') });
  } catch (error) {
    next(error);
  }
});

type RepoResponse = Omit<RepoMetadata, 'inviteCode'> & {
  inviteCode?: string;
  permission: RepoPermission;
};

function createHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

async function resolveCommitActor(actor: RepoActor | null): Promise<{
  identity: { name: string; email: string };
  auditActorId: string | null;
}> {
  if (!actor) {
    throw createHttpError(403, 'Repository write requires authentication');
  }
  if (actor.type === 'user') {
    const author = await findUserById(actor.userId);
    if (!author) {
      throw createHttpError(404, 'User not found');
    }
    return {
      identity: {
        name: author.email.split('@')[0],
        email: author.email
      },
      auditActorId: author.id
    };
  }
  return {
    identity: {
      name: `token:${actor.token.name}`,
      email: `token-${actor.token.id}@mini-github.local`
    },
    auditActorId: `token:${actor.token.id}`
  };
}

function formatRepoResponse(repo: RepoMetadata, permission: RepoPermission): RepoResponse {
  const { inviteCode, ...rest } = repo;
  return {
    ...rest,
    permission,
    ...(permission === 'owner' && inviteCode ? { inviteCode } : {})
  };
}

export default router;
