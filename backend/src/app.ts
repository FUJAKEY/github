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

  const defaultDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
  const contentSecurityPolicy = {
    ...defaultDirectives,
    'script-src': Array.from(new Set([...(defaultDirectives['script-src'] ?? []), "'unsafe-inline'", "'unsafe-eval'"])),
    'style-src': Array.from(
      new Set([...(defaultDirectives['style-src'] ?? []), "'unsafe-inline'", 'https:'])
    ),
    'img-src': Array.from(new Set([...(defaultDirectives['img-src'] ?? []), 'data:', 'blob:'])),
    'font-src': Array.from(new Set([...(defaultDirectives['font-src'] ?? []), 'https:', 'data:'])),
    'connect-src': Array.from(new Set([...(defaultDirectives['connect-src'] ?? ["'self'"]), 'blob:'])),
    'worker-src': ["'self'", 'blob:']
  };

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: contentSecurityPolicy
      },
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/health'
      },
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            url: request.url
          };
        },
        res(response) {
          return {
            statusCode: response.statusCode
          };
        }
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, _res, err) => `${req.method} ${req.url} failed: ${err?.message ?? 'error'}`
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
