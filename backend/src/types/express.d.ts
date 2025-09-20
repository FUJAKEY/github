import type { RepoActor } from '../middleware/auth.js';
import type { RepoPermission } from '../services/repoService.js';

import type { RepoAccessToken, RepoMetadata } from './domain.js';

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
      repoAccess?: {
        actor: RepoActor | null;
        permission: RepoPermission;
        userPermission: RepoPermission;
        tokenPermission: RepoPermission;
        token?: RepoAccessToken;
      };
    }
  }
}

export {};
