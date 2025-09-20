import pino from 'pino';

import { appEnv } from '../config/env.js';

export const logger = pino({
  level: appEnv.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    appEnv.nodeEnv === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        }
});
