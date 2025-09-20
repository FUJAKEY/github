import http from 'http';

import { createApp } from './app.js';
import { appEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { bootstrapStorage } from './services/bootstrapService.js';
import { initAuditLog } from './services/auditService.js';

async function start() {
  try {
    await bootstrapStorage();
    await initAuditLog();
    const app = createApp();
    const server = http.createServer(app);
    server.listen(appEnv.port, () => {
      logger.info(`Server listening on port ${appEnv.port}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

void start();
