import type { FastifyRequest } from 'fastify';
import {
  AuthenticationError,
  ForbiddenError,
  hasRequiredRole,
  WorkspaceRole,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { AccessTokenPayload, parseCookies, verifyAccessToken } from '../lib/jwt.js';

export interface AuthenticatedContext {
  userId: string;
  email: string;
  fullName: string;
  isSystemAdmin: boolean;
}

export interface WorkspaceAuthorizedContext extends AuthenticatedContext {
  workspaceId: string;
  role: WorkspaceRole;
}

export function authenticateRequest(request: FastifyRequest): AuthenticatedContext {
  let rawToken: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice('Bearer '.length).trim();
  }

  if (!rawToken) {
    const cookies = parseCookies(request.headers.cookie);
    rawToken = cookies['aicos_access_token'];
  }

  if (!rawToken) {
    const query = request.query as Record<string, unknown> | undefined;
    // Query-string tokens leak into logs/history; permitted only for SSE streams where EventSource cannot set headers.
    const isStream = (request.url.split('?')[0] ?? '').endsWith('/stream');
    if (isStream && query && typeof query['accessToken'] === 'string') {
      rawToken = query['accessToken'];
    }
  }

  if (!rawToken) {
    throw new AuthenticationError('Missing authentication token');
  }

  const payload: AccessTokenPayload = verifyAccessToken(rawToken);
  return {
    userId: payload.sub,
    email: payload.email,
    fullName: payload.fullName,
    isSystemAdmin: payload.isSystemAdmin,
  };
}

export async function authorizeWorkspace(
  request: FastifyRequest,
  minimumRole: WorkspaceRole = 'VIEWER',
  explicitWorkspaceId?: string,
): Promise<WorkspaceAuthorizedContext> {
  const user = authenticateRequest(request);

  const headerWorkspaceId = request.headers['x-workspace-id'];
  const query = request.query as Record<string, unknown> | undefined;
  const queryWorkspaceId =
    query && typeof query['workspaceId'] === 'string' ? query['workspaceId'] : undefined;

  const workspaceId =
    explicitWorkspaceId ??
    (typeof headerWorkspaceId === 'string' ? headerWorkspaceId.trim() : undefined) ??
    queryWorkspaceId;

  if (!workspaceId) {
    throw new ForbiddenError('Workspace ID is required via X-Workspace-Id header or route parameter');
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.userId,
      },
    },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied: you are not a member of this workspace');
  }

  const role = membership.role as WorkspaceRole;
  if (!hasRequiredRole(role, minimumRole)) {
    throw new ForbiddenError(
      `Access denied: requires ${minimumRole} permission (your role is ${role})`,
    );
  }

  return {
    ...user,
    workspaceId,
    role,
  };
}
