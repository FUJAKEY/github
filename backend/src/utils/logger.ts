import pino from 'pino';

import { appEnv } from '../config/env.js';

export const logger = pino({
  level: 'info',
  base: undefined,
  transport:
    appEnv.nodeEnv === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard'
          }
        }
});
