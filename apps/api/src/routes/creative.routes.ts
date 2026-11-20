import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AdaptAspectRatioRequestSchema,
  applyCompositionPatches,
  compareCompositionSpecs,
  CompositionPatchOperation,
  CompositionSpec,
  CompositionSpecSchema,
  CreateCompositionCommentRequestSchema,
  ExecuteRepurposeCampaignRequestSchema,
  GranularSceneEditRequestSchema,
  NotFoundError,
  QuoteGraphicDeliverable,
  UpdateBrandKitFullRequestSchema,
  ValidationError,
  WrittenPostDeliverable,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { UnifiedAIProviderRegistry } from '@ai-content-os/ai-providers';
import {
  adaptCompositionAspectRatio,
  applyBrandKitToCompositionSpec,
  compileCompositionSpec,
  exportSubtitlesSrt,
  exportSubtitlesVtt,
  inspectFullCompositionMediaBundle,
  PLATFORM_TEMPLATES,
  synthesizeMp4Artifact,
  validateAudioCaptionSynchronization,
} from '@ai-content-os/remotion-engine';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  analyzeAssetInWorkspace,
  renderAndInspectCompositionVersion,
} from '../services/production-pipeline.js';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function registerCreativeWorkflowRoutes(
  app: FastifyInstance,
  storage: MinioStorageAdapter = new MinioStorageAdapter(),
  aiRegistry: UnifiedAIProviderRegistry = new UnifiedAIProviderRegistry(),
): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. Brand Kit Dedicated Management & Inheritance (Priority 3)
  // ---------------------------------------------------------------------------

  app.get('/api/v1/brand-kit', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    let brandKit = await prisma.brandKit.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });

    if (!brandKit) {
      const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId } });
      brandKit = await prisma.brandKit.create({
        data: {
          workspaceId: ctx.workspaceId,
          brandName: ws?.name ?? 'Studio Brand',
          captionStyleJson: {
            style: 'word-highlight',
            fontSizePx: 56,
            highlightColor: '#22D3EE',
            safeBottomMarginPx: 220,
          },
          musicPreferences: {
            genres: ['electronic-ambient'],
            duckingDb: -14,
          },
        },
      });
    }

    return reply.status(200).send({
      success: true,
      data: brandKit,
    });
  });

  app.put('/api/v1/brand-kit', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = UpdateBrandKitFullRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid Brand Kit payload', parsed.error.flatten());
    }

    const data = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      const bk = await tx.brandKit.upsert({
        where: { workspaceId: ctx.workspaceId },
        update: {
          brandName: data.brandName,
          ...(data.logoAssetId !== undefined ? { logoAssetId: data.logoAssetId } : {}),
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
          accentColor: data.accentColor,
          headingFont: data.headingFont,
          bodyFont: data.bodyFont,
          toneOfVoice: data.toneOfVoice,
          editingStyle: data.editingStyle,
          captionStyleJson: {
            style: data.captionStyle,
            fontSizePx: data.captionFontSizePx,
            highlightColor: data.accentColor,
            safeBottomMarginPx: 220,
          },
          ...(data.targetAudience !== undefined ? { targetAudience: data.targetAudience } : {}),
          ...(data.contentObjectives !== undefined
            ? { contentObjectives: data.contentObjectives }
            : {}),
          ...(data.guidelinesText !== undefined ? { guidelinesText: data.guidelinesText } : {}),
        },
        create: {
          workspaceId: ctx.workspaceId,
          brandName: data.brandName,
          logoAssetId: data.logoAssetId ?? null,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
          accentColor: data.accentColor,
          headingFont: data.headingFont,
          bodyFont: data.bodyFont,
          toneOfVoice: data.toneOfVoice,
          editingStyle: data.editingStyle,
          captionStyleJson: {
            style: data.captionStyle,
            fontSizePx: data.captionFontSizePx,
            highlightColor: data.accentColor,
            safeBottomMarginPx: 220,
          },
          musicPreferences: { genres: ['electronic-ambient'], duckingDb: -14 },
          targetAudience: data.targetAudience ?? null,
          contentObjectives: data.contentObjectives ?? null,
          guidelinesText: data.guidelinesText ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'BRAND_KIT_UPDATED',
          entityType: 'BrandKit',
          entityId: bk.id,
          detailsJson: {
            brandName: bk.brandName,
            primaryColor: bk.primaryColor,
            accentColor: bk.accentColor,
          },
        },
      });

      return bk;
    });

    return reply.status(200).send({
      success: true,
      data: updated,
    });
  });

  app.post('/api/v1/compositions/:compositionId/apply-brand-kit', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };

    const [composition, brandKit] = await Promise.all([
      prisma.composition.findFirst({
        where: { id: compositionId, workspaceId: ctx.workspaceId },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
      }),
      prisma.brandKit.findUnique({ where: { workspaceId: ctx.workspaceId } }),
    ]);

    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }
    if (!brandKit) {
      throw new NotFoundError('BrandKit', ctx.workspaceId);
    }

    const currentVersion =
      composition.versions.find((v) => v.id === composition.currentVersionId) ??
      composition.versions[0];
    if (!currentVersion) {
      throw new ValidationError('Composition has no versions');
    }

    const currentSpec = CompositionSpecSchema.parse(currentVersion.specJson);
    const brandedSpec = applyBrandKitToCompositionSpec(currentSpec, brandKit);
    const nextVersionNumber = Math.max(...composition.versions.map((v) => v.versionNumber), 0) + 1;

    const createdVersion = await prisma.$transaction(async (tx) => {
      const ver = await tx.compositionVersion.create({
        data: {
          compositionId: composition.id,
          versionNumber: nextVersionNumber,
          parentVersionId: currentVersion.id,
          specJson: toJson(brandedSpec),
          changeSummary: `Applied Workspace Brand Kit "${brandKit.brandName}" (${brandKit.primaryColor} / ${brandKit.accentColor})`,
          createdByType: 'USER',
          createdById: ctx.userId,
        },
      });

      await tx.composition.update({
        where: { id: composition.id },
        data: { currentVersionId: ver.id },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'BRAND_KIT_APPLIED_TO_COMPOSITION',
          entityType: 'Composition',
          entityId: composition.id,
          detailsJson: { versionNumber: nextVersionNumber, brandName: brandKit.brandName },
        },
      });

      return ver;
    });

    return reply.status(200).send({
      success: true,
      data: {
        version: createdVersion,
        compiled: compileCompositionSpec(brandedSpec),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Granular AI-Powered Scene Editing (Priority 4)
  // ---------------------------------------------------------------------------

  app.post(
    '/api/v1/compositions/:compositionId/scenes/:sceneId/ai-edit',
    async (request, reply) => {
      const ctx = await authorizeWorkspace(request, 'EDITOR');
      const { compositionId, sceneId } = request.params as {
        compositionId: string;
        sceneId: string;
      };
      const parsed = GranularSceneEditRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid granular scene edit payload', parsed.error.flatten());
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
        throw new ValidationError('Composition has no active version');
      }

      const currentSpec = CompositionSpecSchema.parse(currentVersion.specJson);
      const targetScene = currentSpec.scenes.find((s) => s.id === sceneId);
      if (!targetScene) {
        throw new NotFoundError('Scene', sceneId);
      }

      const data = parsed.data;
      const lowerInst = data.instruction.toLowerCase();

      const nextHeadline =
        data.headlineText ??
        (lowerInst.includes('hook') || lowerInst.includes('headline')
          ? data.instruction.replace(/^(change|make|set|use)\s+/i, '').slice(0, 68)
          : targetScene.headlineText);

      const nextTransition =
        data.transitionIn ??
        (lowerInst.includes('zoom')
          ? 'zoom-punch'
          : lowerInst.includes('whip')
            ? 'whip-pan'
            : lowerInst.includes('spring') || lowerInst.includes('cinematic')
              ? 'spring-slide'
              : targetScene.transitionIn);

      const nextLayout =
        data.layout ??
        (lowerInst.includes('split')
          ? 'podcast-split'
          : lowerInst.includes('b-roll')
            ? 'b-roll-overlay'
            : lowerInst.includes('full')
              ? 'full-bleed'
              : targetScene.layout);

      const nextDuration = data.durationInFrames ?? targetScene.durationInFrames;

      const patches: CompositionPatchOperation[] = [
        {
          op: 'UPDATE_SCENE',
          sceneId,
          patch: {
            ...(nextHeadline !== undefined ? { headlineText: nextHeadline } : {}),
            ...(data.narrationText !== undefined ? { narrationText: data.narrationText } : {}),
            ...(data.trimStartSec !== undefined ? { trimStartSec: data.trimStartSec } : {}),
            layout: nextLayout,
            transitionIn: nextTransition,
            durationInFrames: nextDuration,
          },
        },
      ];

      if (data.addOverlayComponent) {
        patches.push({
          op: 'ADD_OVERLAY',
          sceneId,
          overlay: {
            id: `ov-${data.addOverlayComponent.toLowerCase()}-${randomUUID().slice(0, 6)}`,
            component: data.addOverlayComponent,
            startOffsetFrames: 0,
            durationInFrames: nextDuration,
            props: {
              text: nextHeadline ?? 'Highlight',
              accentColor: currentSpec.brand.accentColor,
            },
          },
        });
      }

      const nextSpec = applyCompositionPatches(currentSpec, patches);
      const nextVersionNumber =
        Math.max(...composition.versions.map((v) => v.versionNumber), 0) + 1;

      const createdVersion = await prisma.$transaction(async (tx) => {
        const ver = await tx.compositionVersion.create({
          data: {
            compositionId: composition.id,
            versionNumber: nextVersionNumber,
            parentVersionId: currentVersion.id,
            specJson: toJson(nextSpec),
            changeSummary: `Granular AI Scene Edit (${sceneId}): ${data.instruction}`,
            createdByType: 'AI_AGENT',
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

      return reply.status(200).send({
        success: true,
        data: {
          editedSceneId: sceneId,
          version: createdVersion,
          compiled: compileCompositionSpec(nextSpec),
        },
      });
    },
  );

  // ---------------------------------------------------------------------------
  // 3. Multi-Aspect-Ratio Adaptation & Subtitles Export (Priority 6)
  // ---------------------------------------------------------------------------

  app.post('/api/v1/compositions/:compositionId/aspect-ratio', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };
    const parsed = AdaptAspectRatioRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid aspect ratio payload', parsed.error.flatten());
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
      throw new ValidationError('Composition has no active version');
    }

    const currentSpec = CompositionSpecSchema.parse(currentVersion.specJson);
    const adaptedSpec = adaptCompositionAspectRatio(
      currentSpec,
      parsed.data.aspectRatio,
      parsed.data.templateId,
    );
    const nextVersionNumber = Math.max(...composition.versions.map((v) => v.versionNumber), 0) + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const ver = await tx.compositionVersion.create({
        data: {
          compositionId: composition.id,
          versionNumber: nextVersionNumber,
          parentVersionId: currentVersion.id,
          specJson: toJson(adaptedSpec),
          changeSummary: `Adapted aspect ratio to ${parsed.data.aspectRatio} (${adaptedSpec.width}x${adaptedSpec.height})`,
          createdByType: 'USER',
          createdById: ctx.userId,
        },
      });

      const comp = await tx.composition.update({
        where: { id: composition.id },
        data: {
          aspectRatio: parsed.data.aspectRatio,
          ...(parsed.data.targetPlatform ? { targetPlatform: parsed.data.targetPlatform } : {}),
          width: adaptedSpec.width,
          height: adaptedSpec.height,
          currentVersionId: ver.id,
        },
      });

      return { composition: comp, version: ver };
    });

    return reply.status(200).send({
      success: true,
      data: {
        ...updated,
        compiled: compileCompositionSpec(adaptedSpec),
      },
    });
  });

  app.get('/api/v1/compositions/:compositionId/subtitles', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };

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
      throw new ValidationError('Composition has no active version');
    }

    const spec = CompositionSpecSchema.parse(currentVersion.specJson);
    const compiled = compileCompositionSpec(spec);

    return reply.status(200).send({
      success: true,
      data: {
        compositionId: composition.id,
        versionNumber: currentVersion.versionNumber,
        srt: exportSubtitlesSrt(compiled),
        vtt: exportSubtitlesVtt(compiled),
        synchronization: validateAudioCaptionSynchronization(compiled),
      },
    });
  });

  app.get('/api/v1/compositions/:compositionId/media-inspection', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };

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
      throw new ValidationError('Composition has no active version');
    }

    const spec = CompositionSpecSchema.parse(currentVersion.specJson);
    const compiled = compileCompositionSpec(spec);
    const mp4Bytes = synthesizeMp4Artifact(compiled);
    const bundleReport = inspectFullCompositionMediaBundle(spec, mp4Bytes);

    return reply.status(200).send({
      success: true,
      data: {
        compositionId: composition.id,
        versionNumber: currentVersion.versionNumber,
        ...bundleReport,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Version Comparison, Collaboration Comments & Approval History (Priority 7)
  // ---------------------------------------------------------------------------

  app.get('/api/v1/compositions/:compositionId/compare', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };
    const query = (request.query ?? {}) as { fromVersion?: string; toVersion?: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!composition || composition.versions.length === 0) {
      throw new NotFoundError('Composition', compositionId);
    }

    const versions = composition.versions;
    const toVerNum = query.toVersion
      ? Number(query.toVersion)
      : versions[versions.length - 1]!.versionNumber;
    const fromVerNum = query.fromVersion
      ? Number(query.fromVersion)
      : Math.max(1, toVerNum - 1);

    const fromVer = versions.find((v) => v.versionNumber === fromVerNum) ?? versions[0]!;
    const toVer =
      versions.find((v) => v.versionNumber === toVerNum) ?? versions[versions.length - 1]!;

    const fromSpec = CompositionSpecSchema.parse(fromVer.specJson);
    const toSpec = CompositionSpecSchema.parse(toVer.specJson);
    const diffReport = compareCompositionSpecs(
      fromVer.versionNumber,
      fromSpec,
      toVer.versionNumber,
      toSpec,
    );

    return reply.status(200).send({
      success: true,
      data: {
        compositionId: composition.id,
        fromVersionSummary: fromVer.changeSummary,
        toVersionSummary: toVer.changeSummary,
        diff: diffReport,
      },
    });
  });

  app.get('/api/v1/compositions/:compositionId/comments', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
    });
    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }

    const [comments, approvalHistory] = await Promise.all([
      prisma.compositionComment.findMany({
        where: { compositionId: composition.id, workspaceId: ctx.workspaceId },
        include: {
          author: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          entityId: composition.id,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return reply.status(200).send({
      success: true,
      data: {
        approvalStatus: composition.approvalStatus,
        approvedByUserId: composition.approvedByUserId,
        approvedAt: composition.approvedAt,
        comments,
        approvalHistory,
      },
    });
  });

  app.post('/api/v1/compositions/:compositionId/comments', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { compositionId } = request.params as { compositionId: string };
    const parsed = CreateCompositionCommentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid comment payload', parsed.error.flatten());
    }

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }

    const versionNumber =
      parsed.data.versionNumber ?? composition.versions[0]?.versionNumber ?? 1;

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.compositionComment.create({
        data: {
          workspaceId: ctx.workspaceId,
          compositionId: composition.id,
          versionNumber,
          authorId: ctx.userId,
          sceneId: parsed.data.sceneId ?? null,
          frameIndex: parsed.data.frameIndex ?? null,
          content: parsed.data.content,
        },
        include: {
          author: { select: { id: true, fullName: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'COMPOSITION_COMMENT_ADDED',
          entityType: 'Composition',
          entityId: composition.id,
          detailsJson: {
            commentId: created.id,
            versionNumber,
            sceneId: created.sceneId,
          },
        },
      });

      return created;
    });

    return reply.status(201).send({
      success: true,
      data: comment,
    });
  });

  app.patch(
    '/api/v1/compositions/:compositionId/comments/:commentId/resolve',
    async (request, reply) => {
      const ctx = await authorizeWorkspace(request, 'EDITOR');
      const { compositionId, commentId } = request.params as {
        compositionId: string;
        commentId: string;
      };

      const comment = await prisma.compositionComment.findFirst({
        where: {
          id: commentId,
          compositionId,
          workspaceId: ctx.workspaceId,
        },
      });
      if (!comment) {
        throw new NotFoundError('CompositionComment', commentId);
      }

      const updated = await prisma.compositionComment.update({
        where: { id: comment.id },
        data: {
          resolved: !comment.resolved,
          resolvedAt: !comment.resolved ? new Date() : null,
        },
        include: {
          author: { select: { id: true, fullName: true, email: true } },
        },
      });

      return reply.status(200).send({
        success: true,
        data: updated,
      });
    },
  );

  app.post('/api/v1/compositions/:compositionId/approve', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { compositionId } = request.params as { compositionId: string };

    const composition = await prisma.composition.findFirst({
      where: { id: compositionId, workspaceId: ctx.workspaceId },
    });
    if (!composition) {
      throw new NotFoundError('Composition', compositionId);
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const comp = await tx.composition.update({
        where: { id: composition.id },
        data: {
          approvalStatus: 'APPROVED',
          approvedByUserId: ctx.userId,
          approvedAt: now,
        },
      });

      if (comp.workflowId) {
        await tx.workflow
          .update({
            where: { id: comp.workflowId },
            data: {
              stage: 'APPROVED',
              status: 'COMPLETED',
              approvedByUserId: ctx.userId,
              approvedAt: now,
              completedAt: now,
            },
          })
          .catch(() => null);
      }

      await tx.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'COMPOSITION_APPROVED',
          entityType: 'Composition',
          entityId: comp.id,
          detailsJson: {
            currentVersionId: comp.currentVersionId,
            approvedAt: now.toISOString(),
          },
        },
      });

      return comp;
    });

    return reply.status(200).send({
      success: true,
      data: updated,
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Long-Form-to-Short-Form Content Repurposing Engine (Priority 5)
  // ---------------------------------------------------------------------------

  app.post('/api/v1/repurpose', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = ExecuteRepurposeCampaignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid repurposing campaign payload', parsed.error.flatten());
    }

    const data = parsed.data;
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, workspaceId: ctx.workspaceId },
      include: {
        assets: { orderBy: { createdAt: 'desc' } },
        workspace: { include: { brandKit: true } },
      },
    });
    if (!project) {
      throw new NotFoundError('Project', data.projectId);
    }

    const sourceAsset = data.sourceAssetId
      ? project.assets.find((a) => a.id === data.sourceAssetId)
      : project.assets[0];

    if (sourceAsset && !sourceAsset.aiSummary) {
      await analyzeAssetInWorkspace({
        workspaceId: ctx.workspaceId,
        assetId: sourceAsset.id,
        storage,
        aiRegistry,
      });
    }

    const brandKit = project.workspace.brandKit;
    const generatedCompositions: Array<{
      id: string;
      title: string;
      targetPlatform: string;
      aspectRatio: string;
      width: number;
      height: number;
      versionId: string;
      renderJobId?: string;
      downloadUrl?: string | null;
      qaScore?: number;
    }> = [];

    for (const target of data.targets) {
      const templateDef = PLATFORM_TEMPLATES[target.templateId];
      for (let i = 0; i < target.count; i++) {
        const clipNumber = i + 1;
        const clipTitle = `${data.campaignTitle} — ${target.platform} #${clipNumber}`;
        const hookHeadline = `${data.creativeBrief.slice(0, 48).trim()} (Clip #${clipNumber})`;

        const spec: CompositionSpec = CompositionSpecSchema.parse({
          schemaVersion: '1.0',
          templateId: target.templateId,
          width: templateDef.width,
          height: templateDef.height,
          fps: templateDef.fps,
          durationInFrames: templateDef.fps * 15,
          brand: {
            primaryColor: brandKit?.primaryColor ?? '#6366F1',
            secondaryColor: brandKit?.secondaryColor ?? '#09090B',
            accentColor: brandKit?.accentColor ?? '#22D3EE',
            headingFont: brandKit?.headingFont ?? 'Inter',
            bodyFont: brandKit?.bodyFont ?? 'Inter',
            ...(brandKit?.logoAssetId ? { logoAssetId: brandKit.logoAssetId } : {}),
          },
          captions: {
            enabled: true,
            style: 'word-highlight',
            fontSizePx: 54,
            highlightColor: brandKit?.accentColor ?? '#22D3EE',
            safeBottomMarginPx: templateDef.safeZoneBottomPx,
          },
          audio: {
            musicVolume: 0.15,
            duckingEnabled: true,
          },
          scenes: [
            {
              id: `scene-hook-${clipNumber}`,
              orderIndex: 0,
              startFrame: 0,
              durationInFrames: templateDef.fps * 3,
              layout: 'talking-head',
              ...(sourceAsset ? { primaryAssetId: sourceAsset.id } : {}),
              trimStartSec: i * 15,
              headlineText: hookHeadline,
              narrationText: 'Every high-performing short starts with an unmistakable hook.',
              transitionIn: 'zoom-punch',
              overlays: [
                {
                  id: `ov-hook-${clipNumber}`,
                  component: 'AnimatedHeadline',
                  startOffsetFrames: 0,
                  durationInFrames: templateDef.fps * 3,
                  props: { text: hookHeadline },
                },
              ],
            },
            {
              id: `scene-core-${clipNumber}`,
              orderIndex: 1,
              startFrame: templateDef.fps * 3,
              durationInFrames: templateDef.fps * 9,
              layout: target.aspectRatio === 'PORTRAIT_9_16' ? 'podcast-split' : 'b-roll-overlay',
              ...(sourceAsset ? { primaryAssetId: sourceAsset.id } : {}),
              trimStartSec: i * 15 + 3,
              headlineText: `${target.platform} Core Insight`,
              narrationText: `Repurposed from "${sourceAsset?.originalName ?? project.name}" with Brand Kit colors and dynamic captions.`,
              transitionIn: 'spring-slide',
              overlays: [
                {
                  id: `ov-cap-${clipNumber}`,
                  component: 'WordSyncedCaptions',
                  startOffsetFrames: 0,
                  durationInFrames: templateDef.fps * 9,
                  props: {},
                },
              ],
            },
            {
              id: `scene-cta-${clipNumber}`,
              orderIndex: 2,
              startFrame: templateDef.fps * 12,
              durationInFrames: templateDef.fps * 3,
              layout: 'full-bleed',
              trimStartSec: 0,
              headlineText: 'Follow & Share for Part 2',
              narrationText: 'Watch the full episode and subscribe for the next drop.',
              transitionIn: 'fade',
              overlays: [
                {
                  id: `ov-cta-${clipNumber}`,
                  component: 'CallToActionScene',
                  startOffsetFrames: 0,
                  durationInFrames: templateDef.fps * 3,
                  props: { ctaText: 'Follow & Subscribe' },
                },
              ],
            },
          ],
        });

        const created = await prisma.$transaction(async (tx) => {
          const comp = await tx.composition.create({
            data: {
              workspaceId: ctx.workspaceId,
              projectId: project.id,
              title: clipTitle,
              targetPlatform: target.platform,
              aspectRatio: target.aspectRatio,
              width: spec.width,
              height: spec.height,
              fps: spec.fps,
              durationInFrames: spec.durationInFrames,
              approvalStatus: 'IN_REVIEW',
            },
          });

          const ver = await tx.compositionVersion.create({
            data: {
              compositionId: comp.id,
              versionNumber: 1,
              specJson: toJson(spec),
              changeSummary: `Repurposed for ${target.platform} (${target.aspectRatio})`,
              createdByType: 'AI_AGENT',
              createdById: ctx.userId,
            },
          });

          await tx.composition.update({
            where: { id: comp.id },
            data: { currentVersionId: ver.id },
          });

          return { comp, ver };
        });

        if (data.autoRenderPreviews) {
          const rendered = await renderAndInspectCompositionVersion({
            workspaceId: ctx.workspaceId,
            compositionId: created.comp.id,
            compositionVersionId: created.ver.id,
            storage,
          });
          generatedCompositions.push({
            id: created.comp.id,
            title: created.comp.title,
            targetPlatform: created.comp.targetPlatform,
            aspectRatio: created.comp.aspectRatio,
            width: created.comp.width,
            height: created.comp.height,
            versionId: created.ver.id,
            renderJobId: rendered.renderJob.id,
            downloadUrl: rendered.renderJob.downloadUrl,
            qaScore: rendered.qaReport.overallScore,
          });
        } else {
          generatedCompositions.push({
            id: created.comp.id,
            title: created.comp.title,
            targetPlatform: created.comp.targetPlatform,
            aspectRatio: created.comp.aspectRatio,
            width: created.comp.width,
            height: created.comp.height,
            versionId: created.ver.id,
          });
        }
      }
    }

    const quoteGraphics: QuoteGraphicDeliverable[] = data.includeQuoteGraphics
      ? [
          {
            id: `quote-${randomUUID().slice(0, 8)}`,
            quoteText: `"${data.creativeBrief.slice(0, 120)}"`,
            attribution: brandKit?.brandName ?? project.name,
            aspectRatio: 'SQUARE_1_1',
            primaryColor: brandKit?.primaryColor ?? '#6366F1',
            accentColor: brandKit?.accentColor ?? '#22D3EE',
          },
          {
            id: `quote-${randomUUID().slice(0, 8)}`,
            quoteText:
              '"Turn one long-form recording into an entire multi-platform content campaign automatically."',
            attribution: brandKit?.brandName ?? project.name,
            aspectRatio: 'PORTRAIT_4_5',
            primaryColor: brandKit?.primaryColor ?? '#6366F1',
            accentColor: brandKit?.accentColor ?? '#22D3EE',
          },
        ]
      : [];

    const writtenPosts: WrittenPostDeliverable[] = data.includeWrittenPosts
      ? [
          {
            id: `post-${randomUUID().slice(0, 8)}`,
            platform: 'LINKEDIN',
            hookHeadline: `${data.campaignTitle}: 3 Takeaways from our Latest Session`,
            bodyText: `${data.creativeBrief}\n\n1. Start with a 3-second problem hook.\n2. Synchronize kinetic captions to spoken words.\n3. Repurpose every long-form recording across Reels, Shorts, TikTok, and LinkedIn.`,
            hashtags: ['#AIContentStudio', '#VideoMarketing', '#ContentRepurposing'],
          },
          {
            id: `post-${randomUUID().slice(0, 8)}`,
            platform: 'X_TWITTER',
            hookHeadline: `How we turned 1 recording into ${generatedCompositions.length} platform-native videos:`,
            bodyText: `${data.creativeBrief.slice(0, 180)} — compiled with Remotion & Brand Kit automation.`,
            hashtags: ['#BuildInPublic', '#Remotion', '#CreatorEconomy'],
          },
        ]
      : [];

    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: 'CONTENT_REPURPOSING_BATCH_GENERATED',
        entityType: 'Project',
        entityId: project.id,
        detailsJson: {
          campaignTitle: data.campaignTitle,
          videoDeliverablesCount: generatedCompositions.length,
          quoteGraphicsCount: quoteGraphics.length,
          writtenPostsCount: writtenPosts.length,
        },
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        campaignTitle: data.campaignTitle,
        projectId: project.id,
        sourceAssetId: sourceAsset?.id ?? null,
        compositions: generatedCompositions,
        quoteGraphics,
        writtenPosts,
      },
    });
  });
}
