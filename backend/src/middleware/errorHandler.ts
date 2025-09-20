import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: 'Not found' });
}

interface ErrorWithStatus extends Error {
  status?: number;
}

function getStatus(err: unknown): number {
  if (err instanceof Error && 'status' in err) {
    const value = (err as ErrorWithStatus).status;
    if (typeof value === 'number') {
      return value;
    }
  }
  return 500;
}

export function errorHandler(err: unknown, req: Request, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ message: 'Validation error', issues: err.errors });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  const status = getStatus(err);
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(status).json({ message });
}
