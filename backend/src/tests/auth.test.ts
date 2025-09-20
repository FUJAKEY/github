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

describe('Auth flow', () => {
  it('registers and logs in user', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(201);

    expect(registerRes.body.user.email).toBe('user@example.com');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(200);

    expect(loginRes.body.user.email).toBe('user@example.com');
    expect(loginRes.headers['set-cookie']).toBeDefined();
  });
});
