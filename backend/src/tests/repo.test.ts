import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';

import { createApp } from '../app.js';
import { bootstrapStorage } from '../services/bootstrapService.js';
import { initAuditLog } from '../services/auditService.js';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await bootstrapStorage();
  await initAuditLog();
  app = createApp();
});

describe('Repository lifecycle', () => {
  it('creates repository and commits file', async () => {
    const agent = request.agent(app);

    await agent.post('/api/auth/register').send({ email: 'owner@example.com', password: 'password123' }).expect(201);

    const repoRes = await agent
      .post('/api/repos')
      .send({ name: 'demo', description: 'Demo repo' })
      .expect(201);

    const repoId = repoRes.body.repo.id as string;
    expect(repoRes.body.repo.name).toBe('demo');

    const branchesInitial = await agent.get(`/api/repos/${repoId}/branches`).expect(200);
    expect(branchesInitial.body.branches).toHaveLength(1);
    expect(branchesInitial.body.branches[0].name).toBe('main');

    const initialCommits = await agent.get(`/api/repos/${repoId}/commits`).expect(200);
    expect(initialCommits.body.commits).toHaveLength(1);

    await agent
      .post(`/api/repos/${repoId}/branches`)
      .send({ name: 'feature-test', from: 'main' })
      .expect(201);

    const branchesAfterCreate = await agent.get(`/api/repos/${repoId}/branches`).expect(200);
    expect(branchesAfterCreate.body.branches).toHaveLength(2);

    await agent
      .put(`/api/repos/${repoId}/file`)
      .send({
        path: 'README.md',
        content: '# Demo',
        branch: 'main',
        message: 'Add README'
      })
      .expect(200);

    const treeRes = await agent.get(`/api/repos/${repoId}/tree`).expect(200);
    expect(treeRes.body.tree[0].name).toBe('README.md');

    const commitsRes = await agent.get(`/api/repos/${repoId}/commits`).expect(200);
    expect(commitsRes.body.commits).toHaveLength(2);

    await agent.delete(`/api/repos/${repoId}/branches/feature-test`).expect(204);

    const branchesAfterDelete = await agent.get(`/api/repos/${repoId}/branches`).expect(200);
    expect(branchesAfterDelete.body.branches).toHaveLength(1);

    const deleteDefault = await agent.delete(`/api/repos/${repoId}/branches/main`).expect(400);
    const deleteMessage = deleteDefault.body?.message ?? deleteDefault.text;
    expect(deleteMessage).toContain('default branch');
  });

  it('allows account tokens to access repository content', async () => {
    const agent = request.agent(app);

    await agent.post('/api/auth/register').send({ email: 'token-owner@example.com', password: 'password123' }).expect(201);

    const repoRes = await agent
      .post('/api/repos')
      .send({ name: 'token-demo', description: 'Token repo', private: true })
      .expect(201);

    const repoId = repoRes.body.repo.id as string;

    const tokenRes = await agent
      .post('/api/users/me/tokens')
      .send({ name: 'ci-token', permission: 'write' })
      .expect(201);

    const secret = tokenRes.body.secret as string;
    const tokenId = tokenRes.body.token.id as string;
    expect(secret).toMatch(/\./);

    const tokenClient = request(app);

    const reposList = await tokenClient.get('/api/repos').set('x-account-token', secret).expect(200);
    const repoIds = (reposList.body.items as Array<{ id: string }>).map((repo) => repo.id);
    expect(repoIds).toContain(repoId);

    await tokenClient.get(`/api/repos/${repoId}/branches`).set('x-account-token', secret).expect(200);

    await tokenClient
      .put(`/api/repos/${repoId}/file`)
      .set('x-account-token', secret)
      .send({
        path: 'src/index.ts',
        content: 'console.log("via token");',
        branch: 'main',
        message: 'Token update'
      })
      .expect(200);

    const fileRes = await tokenClient
      .get(`/api/repos/${repoId}/file`)
      .set('x-account-token', secret)
      .query({ path: 'src/index.ts', branch: 'main' })
      .expect(200);

    expect(fileRes.body.content).toContain('via token');

    await agent.delete(`/api/users/me/tokens/${tokenId}`).expect(204);

    await tokenClient.get(`/api/repos/${repoId}/branches`).set('x-account-token', secret).expect(403);
  });
});
