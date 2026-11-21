import type { FastifyInstance } from 'fastify';
import { assertQuotaAvailable } from './intelligence.routes.js';
import {
  applyCompositionPatches,
  CompositionSpecSchema,
  ExecuteProductionWorkflowRequestSchema,
  NotFoundError,
  PatchCompositionRequestSchema,
  ReviseWorkflowRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { UnifiedAIProviderRegistry } from '@ai-content-os/ai-providers';
import {
  compileCompositionSpec,
  PLATFORM_TEMPLATES,
  REMOTION_COMPONENT_LIBRARY,
} from '@ai-content-os/remotion-engine';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  analyzeAssetInWorkspace,
  buildConversationalRevisionPatches,
  executeAutonomousProductionWorkflow,
  renderAndInspectCompositionVersion,
} from '../services/production-pipeline.js';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function registerProductionRoutes(
  app: FastifyInstance,
  storage: MinioStorageAdapter = new MinioStorageAdapter(),
  aiRegistry: UnifiedAIProviderRegistry = new UnifiedAIProviderRegistry(),
): Promise<void> {
  app.get('/api/v1/ai/providers', async (request, reply) => {
    await authorizeWorkspace(request, 'VIEWER');
    return reply.status(200).send({
      success: true,
      data: {
        providers: aiRegistry.getConfiguredProviderStatus(),
        templates: Object.values(PLATFORM_TEMPLATES),
        components: Object.values(REMOTION_COMPONENT_LIBRARY),
      },
    });
  });

  app.post('/api/v1/assets/:assetId/analyze', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { assetId } = request.params as { assetId: string };

    const analyzed = await analyzeAssetInWorkspace({
      workspaceId: ctx.workspaceId,
      assetId,
      storage,
      aiRegistry,
    });

    if (!analyzed) {
      throw new NotFoundError('Asset', assetId);
    }

    return reply.status(200).send({
      success: true,
      data: {
        ...analyzed,
        sizeBytes: Number(analyzed.sizeBytes),
        derivatives: analyzed.derivatives.map((d) => ({
          ...d,
          sizeBytes: Number(d.sizeBytes),
        })),
      },
    });
  });

  app.post('/api/v1/workflows/produce', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    await assertQuotaAvailable(ctx.workspaceId, 'LLM_TOKENS');
    const parsed = ExecuteProductionWorkflowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid production workflow payload', parsed.error.flatten());
    }

    const result = await executeAutonomousProductionWorkflow({
      workspaceId: ctx.workspaceId,
      projectId: parsed.data.projectId,
      ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
      userId: ctx.userId,
      userPrompt: parsed.data.userPrompt,
      ...(parsed.data.targetPlatform ? { targetPlatform: parsed.data.targetPlatform } : {}),
      ...(parsed.data.templateId ? { templateId: parsed.data.templateId } : {}),
      ...(parsed.data.simulateDefectsOnce !== undefined
        ? { simulateDefectsOnce: parsed.data.simulateDefectsOnce }
        : {}),
      storage,
      aiRegistry,
    });

    return reply.status(201).send({
      success: true,
      meta: { isSimulated: result.isSimulated },
      data: result,
    });
  });

  app.post('/api/v1/workflows/:workflowId/approve', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { workflowId } = request.params as { workflowId: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
    });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    if (workflow.stage !== 'AWAITING_APPROVAL') {
      throw new ValidationError(
        `Workflow must be in AWAITING_APPROVAL stage to approve (current stage: ${workflow.stage})`,
      );
    }

    const now = new Date();
    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          stage: 'APPROVED',
          status: 'COMPLETED',
          approvedByUserId: ctx.userId,
          approvedAt: now,
          completedAt: now,
        },
        include: {
          steps: { orderBy: { startedAt: 'asc' } },
          agentRuns: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.workflowStep.create({
        data: {
          workflowId: updated.id,
          stage: 'APPROVED',
          agent: null,
          status: 'COMPLETED',
          outputJson: { approvedByUserId: ctx.userId, approvedAt: now.toISOString() },
          completedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'WORKFLOW_APPROVED',
          entityType: 'Workflow',
          entityId: updated.id,
        },
      });

      return updated;
    });

    return reply.status(200).send({
      success: true,
      data: approved,
    });
  });

  app.post('/api/v1/workflows/:workflowId/revise', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { workflowId } = request.params as { workflowId: string };
    const parsed = ReviseWorkflowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid revision request payload', parsed.error.flatten());
    }

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
      include: {
        compositions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const composition = workflow.compositions[0];
    if (!composition || !composition.currentVersionId) {
      throw new ValidationError('No composition version associated with this workflow to revise');
    }

    const currentVersion = await prisma.compositionVersion.findUnique({
      where: { id: composition.currentVersionId },
    });
    if (!currentVersion) {
      throw new NotFoundError('CompositionVersion', composition.currentVersionId);
    }

    const currentSpec = CompositionSpecSchema.parse(currentVersion.specJson);
    const patches = buildConversationalRevisionPatches(
      currentSpec,
      parsed.data.instruction,
      parsed.data.patches,
    );
    const nextSpec = applyCompositionPatches(currentSpec, patches);

    const maxVersionAgg = await prisma.compositionVersion.aggregate({
      where: { compositionId: composition.id },
      _max: { versionNumber: true },
    });
    const nextVersionNumber = (maxVersionAgg._max.versionNumber ?? currentVersion.versionNumber) + 1;

    const newVersion = await prisma.$transaction(async (tx) => {
      await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          stage: 'REVISING',
          currentAgent: 'VIDEO_EDITOR',
          status: 'RUNNING',
        },
      });

      const createdVersion = await tx.compositionVersion.create({
        data: {
          compositionId: composition.id,
          versionNumber: nextVersionNumber,
          parentVersionId: currentVersion.id,
          specJson: toJson(nextSpec),
          changeSummary: `Revision: ${parsed.data.instruction}`,
          createdByType: 'USER',
          createdById: ctx.userId,
        },
      });

      await tx.composition.update({
        where: { id: composition.id },
        data: {
          currentVersionId: createdVersion.id,
          durationInFrames: nextSpec.durationInFrames,
        },
      });

      await tx.workflowStep.create({
        data: {
          workflowId: workflow.id,
          stage: 'REVISING',
          agent: 'VIDEO_EDITOR',
          status: 'COMPLETED',
          inputJson: { instruction: parsed.data.instruction, patches: toJson(patches) },
          outputJson: { newVersionId: createdVersion.id, versionNumber: nextVersionNumber },
          completedAt: new Date(),
        },
      });

      return createdVersion;
    });

    // Re-render and re-run QA inspection
    const renderOutcome = await renderAndInspectCompositionVersion({
      workspaceId: ctx.workspaceId,
      compositionId: composition.id,
      compositionVersionId: newVersion.id,
      workflowId: workflow.id,
      storage,
    });

    const updatedWorkflow = await prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          stage: 'AWAITING_APPROVAL',
          currentAgent: null,
          status: 'PAUSED_APPROVAL',
        },
        include: {
          steps: { orderBy: { startedAt: 'asc' } },
          agentRuns: { orderBy: { createdAt: 'asc' } },
        },
      });

      await tx.workflowStep.create({
        data: {
          workflowId: wf.id,
          stage: 'AWAITING_APPROVAL',
          agent: null,
          status: 'STARTED',
          outputJson: {
            compositionVersionId: newVersion.id,
            renderJobId: renderOutcome.renderJob.id,
            qaScore: renderOutcome.qaReport.overallScore,
          },
        },
      });

      return wf;
    });

    return reply.status(200).send({
      success: true,
      data: {
        workflow: updatedWorkflow,
        compositionVersion: newVersion,
        renderJob: renderOutcome.renderJob,
        qaReport: renderOutcome.qaReport,
        compiled: renderOutcome.compiled,
      },
    });
  });

  app.post('/api/v1/workflows/:workflowId/cancel', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { workflowId } = request.params as { workflowId: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
    });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          stage: 'CANCELLED',
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      await tx.workflowStep.create({
        data: {
          workflowId: updated.id,
          stage: 'CANCELLED',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return updated;
    });

    return reply.status(200).send({
      success: true,
      data: cancelled,
    });
  });

  app.post('/api/v1/workflows/:workflowId/retry', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { workflowId } = request.params as { workflowId: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId: ctx.workspaceId },
    });
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { retryCount: { increment: 1 } },
    });

    const retried = await executeAutonomousProductionWorkflow({
      workspaceId: ctx.workspaceId,
      projectId: workflow.projectId,
      ...(workflow.conversationId ? { conversationId: workflow.conversationId } : {}),
      userId: ctx.userId,
      userPrompt: workflow.userPrompt,
      storage,
      aiRegistry,
    });

    return reply.status(200).send({
      success: true,
      data: retried,
    });
  });

  // ---------------------------------------------------------------------------
  // Compositions & Interactive Undo/Redo Versioning Endpoints
  // ---------------------------------------------------------------------------

  app.get('/api/v1/compositions', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { projectId?: string };

    const compositions = await prisma.composition.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            renderJobs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { qaInspections: { orderBy: { createdAt: 'desc' }, take: 1 } },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const rendersBucket = storage.getConfig().rendersBucket;
    return reply.status(200).send({
      success: true,
      data: compositions.map((comp) => ({
        ...comp,
        versions: comp.versions.map((ver) => ({
          ...ver,
          renderJobs: ver.renderJobs.map((rj) => ({
            ...rj,
            outputSizeBytes: Number(rj.outputSizeBytes ?? 0n),
            downloadUrl: rj.outputStorageKey
              ? storage.createPresignedUrl({
                  method: 'GET',
                  bucket: rendersBucket,
                  storageKey: rj.outputStorageKey,
                  expiresInSec: 3600,
                  usePublicEndpoint: true,
                })
              : null,
          })),
        })),
      })),
    });
  });

  app.get('/api/v1/compositions/:compositionId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: {
        project: { select: { id: true, name: true } },
        versions: {
          orderBy: { versionNumber: 'asc' },
          include: {
            renderJobs: {
              orderBy: { createdAt: 'desc' },
              include: {
                qaInspections: { orderBy: { createdAt: 'desc' } },
              },
            },
          },
        },
      },
    });

    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }

    const activeVersion =
      composition.versions.find((v) => v.id === composition.currentVersionId) ??
      composition.versions[composition.versions.length - 1] ??
      null;

    const compiled = activeVersion ? compileCompositionSpec(activeVersion.specJson) : null;
    const rendersBucket = storage.getConfig().rendersBucket;

    return reply.status(200).send({
      success: true,
      data: {
        ...composition,
        activeVersion,
        compiled,
        versions: composition.versions.map((ver) => ({
          ...ver,
          renderJobs: ver.renderJobs.map((rj) => ({
            ...rj,
            outputSizeBytes: Number(rj.outputSizeBytes ?? 0n),
            downloadUrl: rj.outputStorageKey
              ? storage.createPresignedUrl({
                  method: 'GET',
                  bucket: rendersBucket,
                  storageKey: rj.outputStorageKey,
                  expiresInSec: 3600,
                  usePublicEndpoint: true,
                })
              : null,
            qaFrameUrls: rj.qaFrameKeys.map((key) =>
              storage.createPresignedUrl({
                method: 'GET',
                bucket: rendersBucket,
                storageKey: key,
                expiresInSec: 3600,
                usePublicEndpoint: true,
              }),
            ),
          })),
        })),
      },
    });
  });

  app.post('/api/v1/compositions/:compositionId/patch', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };
    const parsed = PatchCompositionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid composition patch payload', parsed.error.flatten());
    }

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }

    const currentVersion =
      composition.versions.find((v) => v.id === composition.currentVersionId) ??
      composition.versions[0];
    if (!currentVersion) {
      throw new ValidationError('Composition has no existing version');
    }

    const currentSpec = CompositionSpecSchema.parse(currentVersion.specJson);
    const nextSpec = applyCompositionPatches(currentSpec, parsed.data.patches);
    const maxVersionNum = Math.max(...composition.versions.map((v) => v.versionNumber), 0);
    const nextVersionNumber = maxVersionNum + 1;

    const createdVersion = await prisma.$transaction(async (tx) => {
      const ver = await tx.compositionVersion.create({
        data: {
          compositionId: composition.id,
          versionNumber: nextVersionNumber,
          parentVersionId: currentVersion.id,
          specJson: toJson(nextSpec),
          changeSummary: parsed.data.changeSummary,
          createdByType: 'USER',
          createdById: ctx.userId,
        },
      });

      await tx.composition.update({
        where: { id: composition.id },
        data: {
          currentVersionId: ver.id,
          durationInFrames: nextSpec.durationInFrames,
        },
      });

      return ver;
    });

    return reply.status(201).send({
      success: true,
      data: {
        version: createdVersion,
        compiled: compileCompositionSpec(nextSpec),
      },
    });
  });

  app.post('/api/v1/compositions/:compositionId/undo', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!composition || !composition.currentVersionId) {
      throw new NotFoundError('Composition', compositionId);
    }

    const currentVersion = composition.versions.find((v) => v.id === composition.currentVersionId);
    const parentVersion = currentVersion?.parentVersionId
      ? composition.versions.find((v) => v.id === currentVersion.parentVersionId)
      : composition.versions.find((v) => v.versionNumber === (currentVersion?.versionNumber ?? 1) - 1);

    if (!parentVersion) {
      throw new ValidationError('Already at earliest composition version');
    }

    await prisma.composition.update({
      where: { id: composition.id },
      data: { currentVersionId: parentVersion.id },
    });

    return reply.status(200).send({
      success: true,
      data: {
        currentVersionId: parentVersion.id,
        version: parentVersion,
        compiled: compileCompositionSpec(parentVersion.specJson),
      },
    });
  });

  app.post('/api/v1/compositions/:compositionId/redo', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!composition || !composition.currentVersionId) {
      throw new NotFoundError('Composition', compositionId);
    }

    const currentVersion = composition.versions.find((v) => v.id === composition.currentVersionId);
    const childVersion =
      composition.versions.find((v) => v.parentVersionId === currentVersion?.id) ??
      composition.versions.find((v) => v.versionNumber === (currentVersion?.versionNumber ?? 0) + 1);

    if (!childVersion) {
      throw new ValidationError('Already at latest composition version');
    }

    await prisma.composition.update({
      where: { id: composition.id },
      data: { currentVersionId: childVersion.id },
    });

    return reply.status(200).send({
      success: true,
      data: {
        currentVersionId: childVersion.id,
        version: childVersion,
        compiled: compileCompositionSpec(childVersion.specJson),
      },
    });
  });

  app.post('/api/v1/compositions/:compositionId/render', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    await assertQuotaAvailable(ctx.workspaceId, 'RENDER_SECONDS');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
    });
    if (!composition || !composition.currentVersionId) {
      throw new NotFoundError('Composition', compositionId);
    }

    const outcome = await renderAndInspectCompositionVersion({
      workspaceId: ctx.workspaceId,
      compositionId: composition.id,
      compositionVersionId: composition.currentVersionId,
      ...(composition.workflowId ? { workflowId: composition.workflowId } : {}),
      storage,
    });

    return reply.status(201).send({
      success: true,
      data: outcome,
    });
  });

  app.get('/api/v1/renders/:renderJobId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { renderJobId } = request.params as { renderJobId: string };

    const renderJob = await prisma.renderJob.findFirst({
      where: { id: renderJobId, workspaceId: ctx.workspaceId },
      include: {
        compositionVersion: true,
        qaInspections: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!renderJob) {
      throw new NotFoundError('RenderJob', renderJobId);
    }

    const rendersBucket = storage.getConfig().rendersBucket;
    const downloadUrl = renderJob.outputStorageKey
      ? storage.createPresignedUrl({
          method: 'GET',
          bucket: rendersBucket,
          storageKey: renderJob.outputStorageKey,
          expiresInSec: 3600,
          usePublicEndpoint: true,
        })
      : null;

    const qaFrameUrls = renderJob.qaFrameKeys.map((key) =>
      storage.createPresignedUrl({
        method: 'GET',
        bucket: rendersBucket,
        storageKey: key,
        expiresInSec: 3600,
        usePublicEndpoint: true,
      }),
    );

    return reply.status(200).send({
      success: true,
      data: {
        ...renderJob,
        outputSizeBytes: Number(renderJob.outputSizeBytes ?? 0n),
        downloadUrl,
        qaFrameUrls,
      },
    });
  });
}
