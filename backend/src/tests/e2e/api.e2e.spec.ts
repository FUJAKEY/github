import http from 'http';
import path from 'path';
import fsp from 'fs/promises';
import { AddressInfo } from 'net';

import { test, expect } from '@playwright/test';
let server: http.Server;
let baseURL: string;
const dataRoot = path.join(process.cwd(), 'playwright-data');
let createApp: typeof import('../../app.js')['createApp'];
let bootstrapStorage: typeof import('../../services/bootstrapService.js')['bootstrapStorage'];
let initAuditLog: typeof import('../../services/auditService.js')['initAuditLog'];

test.beforeAll(async () => {
  await fsp.rm(dataRoot, { recursive: true, force: true });
  process.env.JWT_SECRET = 'playwright-secret-playwright-secret-123456789';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.REPOS_ROOT = path.join(dataRoot, 'data');
  ({ createApp } = await import('../../app.js'));
  ({ bootstrapStorage } = await import('../../services/bootstrapService.js'));
  ({ initAuditLog } = await import('../../services/auditService.js'));
  await bootstrapStorage();
  await initAuditLog();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const info = server.address() as AddressInfo;
      baseURL = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fsp.rm(dataRoot, { recursive: true, force: true });
});

test('user can create repo, branch, commit and download zip', async ({ request }) => {
  const register = await request.post(`${baseURL}/api/auth/register`, {
    data: { email: 'e2e@example.com', password: 'password123' }
  });
  expect(register.status()).toBe(201);

  const repoRes = await request.post(`${baseURL}/api/repos`, {
    data: { name: 'playwright-repo', description: 'E2E repo' }
  });
  expect(repoRes.status()).toBe(201);
  const repo = await repoRes.json();
  const repoId = repo.repo.id as string;

  const commitRes = await request.put(`${baseURL}/api/repos/${repoId}/file`, {
    data: {
      path: 'src/index.ts',
      content: 'console.log("Hello E2E");',
      branch: 'main',
      message: 'Initial file'
    }
  });
  expect(commitRes.status()).toBe(200);

  const branchRes = await request.post(`${baseURL}/api/repos/${repoId}/branches`, {
    data: { name: 'feature/e2e', from: 'main' }
  });
  expect(branchRes.status()).toBe(201);

  const featureCommit = await request.put(`${baseURL}/api/repos/${repoId}/file`, {
    data: {
      path: 'src/index.ts',
      content: 'console.log("Feature change");',
      branch: 'feature/e2e',
      message: 'Add feature'
    }
  });
  expect(featureCommit.status()).toBe(200);

  const commits = await request.get(`${baseURL}/api/repos/${repoId}/commits`, {
    params: { branch: 'feature/e2e' }
  });
  const commitsBody = await commits.json();
  expect(commitsBody.commits.length).toBeGreaterThanOrEqual(1);
  const head = commitsBody.commits[0].oid as string;
  const parent = commitsBody.commits[0].parent as string;

  if (parent) {
    const diffRes = await request.get(`${baseURL}/api/repos/${repoId}/diff`, {
      params: { from: parent, to: head }
    });
    expect(diffRes.status()).toBe(200);
    const diffText = await diffRes.json();
    expect(diffText.diff).toContain('Feature change');
  }

  const zipRes = await request.get(`${baseURL}/api/repos/${repoId}/archive.zip`, {
    params: { branch: 'feature/e2e' }
  });
  expect(zipRes.status()).toBe(200);
  const buffer = await zipRes.body();
  expect(buffer.length).toBeGreaterThan(0);

  const tokenRes = await request.post(`${baseURL}/api/users/me/tokens`, {
    data: { name: 'ci-reader', permission: 'read' }
  });
  expect(tokenRes.status()).toBe(201);
  const tokenPayload = await tokenRes.json();
  const tokenSecret = tokenPayload.secret as string;

  const tokenBranches = await request.get(`${baseURL}/api/repos/${repoId}/branches`, {
    headers: { 'x-account-token': tokenSecret }
  });
  expect(tokenBranches.status()).toBe(200);
});
