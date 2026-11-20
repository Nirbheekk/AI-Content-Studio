import type { FastifyInstance } from 'fastify';
import {
  CreateProjectRequestSchema,
  NotFoundError,
  UpdateProjectRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { authorizeWorkspace } from '../middleware/auth.js';

export async function registerProjectAndDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/dashboard', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');

    const [
      workspace,
      totalProjects,
      activeProjects,
      archivedProjects,
      totalAssets,
      assetStorageAgg,
      recentProjects,
      recentConversations,
      processingJobs,
      recentActivity,
    ] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        include: { brandKit: true },
      }),
      prisma.project.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.project.count({ where: { workspaceId: ctx.workspaceId, status: 'ACTIVE' } }),
      prisma.project.count({ where: { workspaceId: ctx.workspaceId, status: 'ARCHIVED' } }),
      prisma.asset.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.asset.aggregate({
        where: { workspaceId: ctx.workspaceId },
        _sum: { sizeBytes: true },
      }),
      prisma.project.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          _count: {
            select: {
              assets: true,
              conversations: true,
              workflows: true,
              compositions: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      prisma.conversation.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          project: {
            select: { id: true, name: true },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      prisma.workflow.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      prisma.auditLog.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    if (!workspace) {
      throw new NotFoundError('Workspace', ctx.workspaceId);
    }

    return reply.status(200).send({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          planTier: workspace.planTier,
          role: ctx.role,
          monthlyTokenQuota: workspace.monthlyTokenQuota,
          monthlyRenderMinutesQuota: workspace.monthlyRenderMinutesQuota,
          monthlyStorageBytesQuota: Number(workspace.monthlyStorageBytesQuota),
          brandKit: workspace.brandKit,
        },
        stats: {
          totalProjects,
          activeProjects,
          archivedProjects,
          totalAssets,
          totalStorageBytes: Number(assetStorageAgg._sum.sizeBytes ?? 0n),
          activeWorkflowCount: processingJobs.filter((w) => w.status === 'RUNNING').length,
        },
        recentProjects,
        recentConversations,
        processingJobs,
        recentActivity,
      },
    });
  });

  app.get('/api/v1/projects', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { status?: string; search?: string };

    const projects = await prisma.project.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              name: {
                contains: query.search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        _count: {
          select: {
            assets: true,
            conversations: true,
            workflows: true,
            compositions: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.status(200).send({
      success: true,
      data: projects,
    });
  });

  app.post('/api/v1/projects', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid project creation payload', parsed.error.flatten());
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId: ctx.workspaceId,
          createdById: ctx.userId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          status: 'ACTIVE',
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: created.id,
          detailsJson: { name: created.name },
        },
      });

      return created;
    });

    return reply.status(201).send({
      success: true,
      data: project,
    });
  });

  app.get('/api/v1/projects/:projectId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { projectId } = request.params as { projectId: string };

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId: ctx.workspaceId,
      },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        assets: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        conversations: {
          orderBy: { updatedAt: 'desc' },
          include: {
            _count: { select: { messages: true } },
          },
        },
        workflows: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
        compositions: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    return reply.status(200).send({
      success: true,
      data: {
        ...project,
        assets: project.assets.map((a) => ({
          ...a,
          sizeBytes: Number(a.sizeBytes),
        })),
      },
    });
  });

  app.patch('/api/v1/projects/:projectId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { projectId } = request.params as { projectId: string };
    const parsed = UpdateProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid project update payload', parsed.error.flatten());
    }

    const existing = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      throw new NotFoundError('Project', projectId);
    }

    const updated = await prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.status !== undefined
          ? {
              status: parsed.data.status,
              archivedAt: parsed.data.status === 'ARCHIVED' ? new Date() : null,
            }
          : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: 'PROJECT_UPDATED',
        entityType: 'Project',
        entityId: updated.id,
      },
    });

    return reply.status(200).send({
      success: true,
      data: updated,
    });
  });

  app.post('/api/v1/projects/:projectId/archive', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { projectId } = request.params as { projectId: string };

    const existing = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      throw new NotFoundError('Project', projectId);
    }

    const archived = await prisma.project.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: 'PROJECT_ARCHIVED',
        entityType: 'Project',
        entityId: archived.id,
      },
    });

    return reply.status(200).send({
      success: true,
      data: archived,
    });
  });

  app.post('/api/v1/projects/:projectId/restore', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { projectId } = request.params as { projectId: string };

    const existing = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      throw new NotFoundError('Project', projectId);
    }

    const restored = await prisma.project.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', archivedAt: null },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: 'PROJECT_RESTORED',
        entityType: 'Project',
        entityId: restored.id,
      },
    });

    return reply.status(200).send({
      success: true,
      data: restored,
    });
  });

  app.delete('/api/v1/projects/:projectId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const { projectId } = request.params as { projectId: string };
    const query = (request.query ?? {}) as { confirmDelete?: string };

    const existing = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
    });
    if (!existing) {
      throw new NotFoundError('Project', projectId);
    }

    if (existing.status !== 'ARCHIVED' && query.confirmDelete !== 'true') {
      throw new ValidationError(
        'Safeguard: archive project before deleting, or pass confirmDelete=true',
      );
    }

    await prisma.$transaction([
      prisma.project.delete({ where: { id: existing.id } }),
      prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'PROJECT_DELETED',
          entityType: 'Project',
          entityId: existing.id,
          detailsJson: { name: existing.name },
        },
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: { deletedProjectId: existing.id },
    });
  });
}
