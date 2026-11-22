import type { FastifyInstance } from 'fastify';
import {
  CorrectTranscriptRequestSchema,
  GenerateEditorialPlanRequestSchema,
  HighlightDiscoveryRequestSchema,
  NotFoundError,
  SemanticMediaSearchRequestSchema,
  UpdateEditorialConceptRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  discoverAssetHighlights,
  generateEditorialPlan,
  searchWorkspaceMediaMoments,
  updateEditorialConceptDecision,
} from '../services/editorial-intelligence.service.js';

export async function registerEditorialRoutes(app: FastifyInstance): Promise<void> {
  // 1. Hybrid Semantic Media Search across workspace assets, transcripts & scenes
  app.post('/api/v1/editorial/search', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = SemanticMediaSearchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid semantic search payload', parsed.error.flatten());
    }
    const hits = await searchWorkspaceMediaMoments({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(200).send({
      success: true,
      data: {
        query: parsed.data.query,
        totalHits: hits.length,
        hits,
      },
    });
  });

  // 2. Evidence-Backed Highlight & Hook Detection
  app.post('/api/v1/editorial/highlights', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = HighlightDiscoveryRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid highlight discovery payload', parsed.error.flatten());
    }
    const highlights = await discoverAssetHighlights({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(200).send({
      success: true,
      data: {
        totalHighlights: highlights.length,
        highlights,
      },
    });
  });

  // 3. Autonomous Multi-Concept Editorial Plan Generator
  app.post('/api/v1/editorial/plans', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = GenerateEditorialPlanRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid editorial plan payload', parsed.error.flatten());
    }
    const result = await generateEditorialPlan({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // 4. List & Retrieve Persisted Editorial Plans
  app.get('/api/v1/editorial/plans', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as { projectId?: string };
    const plans = await prisma.editorialPlan.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      include: { concepts: { orderBy: { rank: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return reply.status(200).send({ success: true, data: plans });
  });

  app.get('/api/v1/editorial/plans/:planId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { planId } = request.params as { planId: string };
    const plan = await prisma.editorialPlan.findFirst({
      where: { id: planId, workspaceId: ctx.workspaceId },
      include: { concepts: { orderBy: { rank: 'asc' } } },
    });
    if (!plan) {
      throw new NotFoundError('EditorialPlan', planId);
    }
    return reply.status(200).send({ success: true, data: plan });
  });

  // 5. Edit, Reject, or Approve an Editorial Concept (Human-in-the-Loop Gate)
  app.patch('/api/v1/editorial/plans/:planId/concepts/:conceptId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { planId, conceptId } = request.params as { planId: string; conceptId: string };
    const parsed = UpdateEditorialConceptRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid editorial concept update payload', parsed.error.flatten());
    }
    const result = await updateEditorialConceptDecision({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      planId,
      conceptId,
      input: parsed.data,
    });
    return reply.status(200).send({ success: true, data: result });
  });

  // 6. Save User-Corrected Transcript (Preserves Original fullText Separately)
  app.put('/api/v1/assets/:assetId/transcript', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { assetId } = request.params as { assetId: string };
    const parsed = CorrectTranscriptRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid transcript correction payload', parsed.error.flatten());
    }
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: ctx.workspaceId },
      include: { transcript: true },
    });
    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    const transcript = asset.transcript
      ? await prisma.transcript.update({
          where: { id: asset.transcript.id },
          data: { correctedText: parsed.data.correctedText },
        })
      : await prisma.transcript.create({
          data: {
            assetId: asset.id,
            language: 'en',
            fullText: parsed.data.correctedText,
            correctedText: parsed.data.correctedText,
            segmentsJson: [{ startSec: 0, endSec: asset.durationSec ?? 15, text: parsed.data.correctedText }],
            provider: 'user-manual-transcript',
          },
        });

    return reply.status(200).send({ success: true, data: transcript });
  });
}
