import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

import { appEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { attachUser } from './middleware/auth.js';
import authRoutes from './api/authRoutes.js';
import userRoutes from './api/userRoutes.js';
import repoRoutes from './api/repoRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openApiPath = path.join(__dirname, '../openapi.yaml');
const openApiDoc = YAML.parse(fs.readFileSync(openApiPath, 'utf8'));

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin: appEnv.frontendUrl,
      credentials: true
    })
  );
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(
    pinoHttp({
      logger,
      customSuccessMessage: () => 'request completed'
    })
  );
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/repos', repoRoutes);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

  const staticDir = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
