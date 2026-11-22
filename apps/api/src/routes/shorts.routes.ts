import type { FastifyInstance } from 'fastify';
import {
  AnalyzeSmartCutsRequestSchema,
  CAPTION_PRESETS,
  CaptionPreviewRequestSchema,
  GenerateShortsBatchRequestSchema,
  MOTION_PRESETS,
  ValidationError,
} from '@ai-content-os/shared';
import type { MinioStorageAdapter } from '@ai-content-os/integrations';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  analyzeAssetSmartCuts,
  generateCaptionPreview,
  generateShortsBatch,
} from '../services/shorts-factory.service.js';

export async function registerShortsRoutes(
  app: FastifyInstance,
  storage?: MinioStorageAdapter,
): Promise<void> {
  // 1. List all 8 Caption Presets & 5 Motion Presets
  app.get('/api/v1/shorts/presets', async (request, reply) => {
    await authorizeWorkspace(request, 'VIEWER');
    return reply.status(200).send({
      success: true,
      data: {
        captionPresets: CAPTION_PRESETS,
        motionPresets: MOTION_PRESETS,
        smartCutPresets: ['GENTLE', 'BALANCED', 'AGGRESSIVE', 'MANUAL_REVIEW'],
      },
    });
  });

  // 2. Non-destructive Smart Cut analysis (silences, fillers, false starts, retakes)
  app.post('/api/v1/shorts/smart-cuts', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = AnalyzeSmartCutsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid smart cut request payload', parsed.error.flatten());
    }
    const result = await analyzeAssetSmartCuts({
      workspaceId: ctx.workspaceId,
      assetId: parsed.data.assetId,
      preset: parsed.data.preset,
    });
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // 3. Caption style preview & ASS/SRT/VTT generation
  app.post('/api/v1/shorts/captions/preview', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = CaptionPreviewRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid caption preview payload', parsed.error.flatten());
    }
    const result = await generateCaptionPreview({
      workspaceId: ctx.workspaceId,
      assetId: parsed.data.assetId,
      captionPresetId: parsed.data.captionPresetId,
      maxDurationSec: parsed.data.maxDurationSec,
    });
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // 4. Generate a batch of editable, Creative-QA + Signal-QA verified Shorts
  app.post('/api/v1/shorts/batch', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = GenerateShortsBatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid shorts batch request payload', parsed.error.flatten());
    }
    const result = await generateShortsBatch({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
      storage,
    });
    return reply.status(201).send({
      success: true,
      data: result,
    });
  });
}
