import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AcceptInvitationRequestSchema,
  CreateInvitationRequestSchema,
  CreateWorkspaceRequestSchema,
  ForbiddenError,
  NotFoundError,
  UpdateMemberRoleRequestSchema,
  UpdateWorkspaceRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { generateOpaqueToken, hashOpaqueToken } from '../lib/jwt.js';
import { authenticateRequest, authorizeWorkspace } from '../middleware/auth.js';

function createUniqueSlug(name: string, explicitSlug?: string): string {
  if (explicitSlug) {
    return explicitSlug;
  }
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'workspace'}-${randomUUID().slice(0, 6)}`;
}

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/workspaces', async (request, reply) => {
    const authUser = authenticateRequest(request);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: authUser.userId },
      include: {
        workspace: {
          include: {
            brandKit: true,
            _count: {
              select: {
                projects: true,
                assets: true,
                members: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return reply.status(200).send({
      success: true,
      data: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        planTier: m.workspace.planTier,
        role: m.role,
        autoPublishApproved: m.workspace.autoPublishApproved,
        brandKit: m.workspace.brandKit,
        counts: m.workspace._count,
      })),
    });
  });

  app.post('/api/v1/workspaces', async (request, reply) => {
    const authUser = authenticateRequest(request);
    const parsed = CreateWorkspaceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid workspace payload', parsed.error.flatten());
    }

    const slug = createUniqueSlug(parsed.data.name, parsed.data.slug);
    const existingSlug = await prisma.workspace.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ValidationError(`Workspace slug "${slug}" is already in use`);
    }

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name: parsed.data.name,
          slug,
          planTier: 'PRO',
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: authUser.userId,
          role: 'OWNER',
        },
      });

      await tx.brandKit.create({
        data: {
          workspaceId: ws.id,
          brandName: parsed.data.name,
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

      await tx.auditLog.create({
        data: {
          workspaceId: ws.id,
          userId: authUser.userId,
          action: 'WORKSPACE_CREATED',
          entityType: 'Workspace',
          entityId: ws.id,
          ipAddress: request.ip,
        },
      });

      return ws;
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        planTier: workspace.planTier,
        role: 'OWNER',
      },
    });
  });

  app.get('/api/v1/workspaces/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await authorizeWorkspace(request, 'VIEWER', workspaceId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      include: {
        brandKit: true,
        _count: {
          select: {
            projects: true,
            assets: true,
            members: true,
            compositions: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace', ctx.workspaceId);
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        planTier: workspace.planTier,
        autoPublishApproved: workspace.autoPublishApproved,
        monthlyTokenQuota: workspace.monthlyTokenQuota,
        monthlyRenderMinutesQuota: workspace.monthlyRenderMinutesQuota,
        monthlyStorageBytesQuota: Number(workspace.monthlyStorageBytesQuota),
        role: ctx.role,
        brandKit: workspace.brandKit,
        counts: workspace._count,
      },
    });
  });

  app.patch('/api/v1/workspaces/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await authorizeWorkspace(request, 'ADMIN', workspaceId);

    const parsed = UpdateWorkspaceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid workspace update payload', parsed.error.flatten());
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.autoPublishApproved !== undefined
            ? { autoPublishApproved: parsed.data.autoPublishApproved }
            : {}),
        },
      });

      if (
        parsed.data.brandName !== undefined ||
        parsed.data.primaryColor !== undefined ||
        parsed.data.accentColor !== undefined ||
        parsed.data.toneOfVoice !== undefined
      ) {
        await tx.brandKit.upsert({
          where: { workspaceId: ctx.workspaceId },
          update: {
            ...(parsed.data.brandName !== undefined ? { brandName: parsed.data.brandName } : {}),
            ...(parsed.data.primaryColor !== undefined
              ? { primaryColor: parsed.data.primaryColor }
              : {}),
            ...(parsed.data.accentColor !== undefined
              ? { accentColor: parsed.data.accentColor }
              : {}),
            ...(parsed.data.toneOfVoice !== undefined
              ? { toneOfVoice: parsed.data.toneOfVoice }
              : {}),
          },
          create: {
            workspaceId: ctx.workspaceId,
            brandName: parsed.data.brandName ?? ws.name,
            primaryColor: parsed.data.primaryColor ?? '#6366F1',
            accentColor: parsed.data.accentColor ?? '#22D3EE',
            toneOfVoice: parsed.data.toneOfVoice ?? 'Authoritative, engaging, concise',
            captionStyleJson: { style: 'word-highlight', fontSizePx: 54 },
            musicPreferences: { duckingDb: -14 },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'WORKSPACE_UPDATED',
          entityType: 'Workspace',
          entityId: ctx.workspaceId,
        },
      });

      return tx.workspace.findUnique({
        where: { id: ctx.workspaceId },
        include: { brandKit: true },
      });
    });

    return reply.status(200).send({
      success: true,
      data: updated
        ? {
            ...updated,
            monthlyStorageBytesQuota: Number(updated.monthlyStorageBytesQuota),
          }
        : null,
    });
  });

  app.get('/api/v1/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await authorizeWorkspace(request, 'VIEWER', workspaceId);

    const [members, invitations] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.workspaceInvitation.findMany({
        where: { workspaceId: ctx.workspaceId, status: 'PENDING' },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: {
        members,
        invitations,
      },
    });
  });

  app.post('/api/v1/workspaces/:workspaceId/invitations', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await authorizeWorkspace(request, 'ADMIN', workspaceId);

    const parsed = CreateInvitationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid invitation payload', parsed.error.flatten());
    }

    if (parsed.data.role === 'OWNER' && ctx.role !== 'OWNER') {
      throw new ForbiddenError('Only a workspace OWNER can invite another OWNER');
    }

    const rawToken = generateOpaqueToken(24);
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId: ctx.workspaceId,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        tokenHash,
        invitedById: ctx.userId,
        status: 'PENDING',
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: 'WORKSPACE_INVITATION_CREATED',
        entityType: 'WorkspaceInvitation',
        entityId: invitation.id,
        detailsJson: { email: invitation.email, role: invitation.role },
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: invitation.id,
        workspaceId: invitation.workspaceId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        inviteToken: rawToken,
      },
    });
  });

  app.post('/api/v1/workspaces/invitations/accept', async (request, reply) => {
    const authUser = authenticateRequest(request);
    const parsed = AcceptInvitationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid invitation token payload', parsed.error.flatten());
    }

    const tokenHash = hashOpaqueToken(parsed.data.token);
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { tokenHash },
      include: { workspace: true },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundError('WorkspaceInvitation');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new ValidationError('This workspace invitation has expired');
    }

    if (invitation.email.toLowerCase() !== authUser.email.toLowerCase()) {
      throw new ForbiddenError('This invitation was issued to a different email address');
    }

    const membership = await prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      const member = await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: authUser.userId,
          },
        },
        update: { role: invitation.role },
        create: {
          workspaceId: invitation.workspaceId,
          userId: authUser.userId,
          role: invitation.role,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: authUser.userId,
          action: 'WORKSPACE_INVITATION_ACCEPTED',
          entityType: 'WorkspaceMember',
          entityId: member.id,
        },
      });

      return member;
    });

    return reply.status(200).send({
      success: true,
      data: {
        workspaceId: invitation.workspaceId,
        workspaceName: invitation.workspace.name,
        role: membership.role,
      },
    });
  });

  app.patch('/api/v1/workspaces/:workspaceId/members/:memberId', async (request, reply) => {
    const { workspaceId, memberId } = request.params as {
      workspaceId: string;
      memberId: string;
    };
    const ctx = await authorizeWorkspace(request, 'ADMIN', workspaceId);

    const parsed = UpdateMemberRoleRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid member role update payload', parsed.error.flatten());
    }

    const targetMember = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspaceId },
    });
    if (!targetMember) {
      throw new NotFoundError('WorkspaceMember', memberId);
    }

    if (
      (targetMember.role === 'OWNER' || parsed.data.role === 'OWNER') &&
      ctx.role !== 'OWNER'
    ) {
      throw new ForbiddenError('Only a workspace OWNER can assign or modify OWNER roles');
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: targetMember.id },
      data: { role: parsed.data.role },
    });

    return reply.status(200).send({
      success: true,
      data: updated,
    });
  });
}
