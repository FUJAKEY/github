import path from 'path';
import { randomUUID } from 'crypto';

import { appEnv } from '../config/env.js';
import { AuditEvent } from '../types/domain.js';
import { appendLine, ensureDir } from '../utils/fs.js';

const auditDir = path.join(appEnv.reposRoot, 'audit');
const auditFile = path.join(auditDir, 'log.ndjson');

export async function initAuditLog(): Promise<void> {
  await ensureDir(auditDir);
}

export async function logAudit(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
  const record: AuditEvent = {
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString()
  };
  await appendLine(auditFile, JSON.stringify(record));
}
