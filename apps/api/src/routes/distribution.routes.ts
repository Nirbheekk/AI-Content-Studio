import type { FastifyInstance } from 'fastify';
import {
  ImportAuthorizedMetricsRequestSchema,
  ReschedulePublishPostRequestSchema,
  ValidateDeliverableRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  generateContentIntelligenceReport,
  importAuthorizedAnalyticsMetrics,
  listSocialPlatformCapabilities,
  reschedulePublishPost,
  validateDeliverableForPlatform,
} from '../services/distribution-intelligence.service.js';

export async function registerDistributionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/distribution/capabilities', async (request, reply) => {
    await authorizeWorkspace(request, 'VIEWER');
    return reply.status(200).send({
      success: true,
      data: {
        platforms: listSocialPlatformCapabilities(),
      },
    });
  });

  app.post('/api/v1/distribution/validate', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const parsed = ValidateDeliverableRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid deliverable validation payload', parsed.error.flatten());
    }
    const result = await validateDeliverableForPlatform({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(200).send({ success: true, data: result });
  });

  app.patch('/api/v1/distribution/posts/:postId/reschedule', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };
    const parsed = ReschedulePublishPostRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid reschedule payload', parsed.error.flatten());
    }
    const updated = await reschedulePublishPost({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      postId,
      input: parsed.data,
    });
    return reply.status(200).send({ success: true, data: updated });
  });

  app.post('/api/v1/distribution/analytics/import', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = ImportAuthorizedMetricsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid metrics import payload', parsed.error.flatten());
    }
    const saved = await importAuthorizedAnalyticsMetrics({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(201).send({ success: true, data: saved });
  });

  app.get('/api/v1/distribution/intelligence', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const report = await generateContentIntelligenceReport(ctx.workspaceId);
    return reply.status(200).send({ success: true, data: report });
  });
}
