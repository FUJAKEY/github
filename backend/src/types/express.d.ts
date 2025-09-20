import type { RepoMetadata } from './domain.js';

declare global {
  namespace Express {
    interface User {
      id: string;
      role: string;
    }

    interface Request {
      user?: User;
    }

    interface Locals {
      repo?: {
        metadata: RepoMetadata;
        dir: string;
      };
    }
  }
}

export {};
