export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: UserRole;
}

export type CollaboratorRole = 'read' | 'write';

export interface RepoCollaborator {
  userId: string;
  role: CollaboratorRole;
  invitedAt: string;
}

export type RepoAccessTokenPermission = 'read' | 'write';

export interface RepoAccessToken {
  id: string;
  name: string;
  permission: RepoAccessTokenPermission;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RepoMetadata {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  private: boolean;
  createdAt: string;
  defaultBranch: string;
  collaborators: RepoCollaborator[];
  inviteCode: string;
}

export interface RefreshTokenRecord {
  jti: string;
  userId: string;
  exp: number;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  actorId: string | null;
  repoId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
