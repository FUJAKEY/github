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
    expect(commitsRes.body.commits).toHaveLength(1);
  });
});
