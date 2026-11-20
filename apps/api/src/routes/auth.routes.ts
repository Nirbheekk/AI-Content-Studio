import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AuthenticationError,
  LoginRequestSchema,
  RefreshTokenRequestSchema,
  RegisterRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { hashPassword, prisma, verifyPassword } from '@ai-content-os/database';
import {
  clearAuthCookies,
  generateOpaqueToken,
  hashOpaqueToken,
  parseCookies,
  REFRESH_TOKEN_TTL_MS,
  setAuthCookies,
  signAccessToken,
  SlidingWindowRateLimiter,
} from '../lib/jwt.js';
import { authenticateRequest } from '../middleware/auth.js';

function slugifyWorkspaceName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'workspace'}-${randomUUID().slice(0, 6)}`;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const rateLimiter = new SlidingWindowRateLimiter(30, 60_000);

  app.post('/api/v1/auth/register', async (request, reply) => {
    rateLimiter.enforce(request, 'register');
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid registration payload', parsed.error.flatten());
    }

    const { email, password, fullName, workspaceName } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ValidationError('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    const defaultWorkspaceName = workspaceName ?? `${fullName}'s Studio`;
    const workspaceSlug = slugifyWorkspaceName(defaultWorkspaceName);
    const rawRefreshToken = generateOpaqueToken(32);
    const refreshTokenHash = hashOpaqueToken(rawRefreshToken);
    const familyId = randomUUID();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: defaultWorkspaceName,
          slug: workspaceSlug,
          planTier: 'PRO',
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      await tx.brandKit.create({
        data: {
          workspaceId: workspace.id,
          brandName: defaultWorkspaceName,
          captionStyleJson: {
            style: 'word-highlight',
            fontSizePx: 54,
            highlightColor: '#22D3EE',
            safeBottomMarginPx: 220,
          },
          musicPreferences: {
            genres: ['electronic-ambient'],
            duckingDb: -14,
          },
        },
      });

      await tx.userSession.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          familyId,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          action: 'USER_REGISTERED',
          entityType: 'User',
          entityId: user.id,
          ipAddress: request.ip,
        },
      });

      return { user, workspace };
    });

    const accessToken = signAccessToken(result.user);
    setAuthCookies(reply, accessToken, rawRefreshToken);

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          avatarUrl: result.user.avatarUrl,
          isSystemAdmin: result.user.isSystemAdmin,
        },
        workspaces: [
          {
            id: result.workspace.id,
            name: result.workspace.name,
            slug: result.workspace.slug,
            planTier: result.workspace.planTier,
            role: 'OWNER',
          },
        ],
        activeWorkspaceId: result.workspace.id,
        accessToken,
        refreshToken: rawRefreshToken,
      },
    });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    rateLimiter.enforce(request, 'login');
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login credentials format', parsed.error.flatten());
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AuthenticationError('Invalid email or password');
    }

    const rawRefreshToken = generateOpaqueToken(32);
    const refreshTokenHash = hashOpaqueToken(rawRefreshToken);
    const familyId = randomUUID();

    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        familyId,
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    const workspaces = user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      planTier: m.workspace.planTier,
      role: m.role,
    }));

    const firstWorkspaceId = workspaces[0]?.id ?? null;
    if (firstWorkspaceId) {
      await prisma.auditLog.create({
        data: {
          workspaceId: firstWorkspaceId,
          userId: user.id,
          action: 'USER_LOGGED_IN',
          entityType: 'User',
          entityId: user.id,
          ipAddress: request.ip,
        },
      });
    }

    const accessToken = signAccessToken(user);
    setAuthCookies(reply, accessToken, rawRefreshToken);

    return reply.status(200).send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          isSystemAdmin: user.isSystemAdmin,
        },
        workspaces,
        activeWorkspaceId: firstWorkspaceId,
        accessToken,
        refreshToken: rawRefreshToken,
      },
    });
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    rateLimiter.enforce(request, 'refresh');
    const parsed = RefreshTokenRequestSchema.safeParse(request.body ?? {});
    const cookies = parseCookies(request.headers.cookie);
    const rawToken =
      (parsed.success ? parsed.data.refreshToken : undefined) ?? cookies['aicos_refresh_token'];

    if (!rawToken) {
      throw new AuthenticationError('Missing refresh token');
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const session = await prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Reuse detection: if token was already revoked, revoke all sessions in this family
    if (session.revokedAt !== null) {
      await prisma.userSession.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      clearAuthCookies(reply);
      throw new AuthenticationError('Refresh token reuse detected; session family revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AuthenticationError('Refresh token expired');
    }

    const nextRawRefreshToken = generateOpaqueToken(32);
    const nextRefreshTokenHash = hashOpaqueToken(nextRawRefreshToken);

    await prisma.$transaction([
      prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.userSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: nextRefreshTokenHash,
          familyId: session.familyId,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
    ]);

    const accessToken = signAccessToken(session.user);
    setAuthCookies(reply, accessToken, nextRawRefreshToken);

    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken: nextRawRefreshToken,
      },
    });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const body = (request.body ?? {}) as { refreshToken?: string };
    const rawRefresh = body.refreshToken ?? cookies['aicos_refresh_token'];

    if (rawRefresh) {
      const tokenHash = hashOpaqueToken(rawRefresh);
      await prisma.userSession.updateMany({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    clearAuthCookies(reply);
    return reply.status(200).send({
      success: true,
      data: { loggedOut: true },
    });
  });

  app.get('/api/v1/auth/me', async (request, reply) => {
    const authUser = authenticateRequest(request);
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                brandKit: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new AuthenticationError('User account no longer exists');
    }

    const workspaces = user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      planTier: m.workspace.planTier,
      role: m.role,
      monthlyTokenQuota: m.workspace.monthlyTokenQuota,
      monthlyRenderMinutesQuota: m.workspace.monthlyRenderMinutesQuota,
      brandKit: m.workspace.brandKit,
    }));

    return reply.status(200).send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          isSystemAdmin: user.isSystemAdmin,
          createdAt: user.createdAt.toISOString(),
        },
        workspaces,
      },
    });
  });
}
