import type { FastifyInstance } from 'fastify';
import {
  CreateGenerativeJobRequestSchema,
  CreateVoiceConsentRequestSchema,
  GenerativeJobDecisionRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import type { MinioStorageAdapter } from '@ai-content-os/integrations';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  createGenerativeAssetJob,
  createVoiceConsentRecord,
  decideGenerativeJob,
  listGenerativeJobs,
  listProviderCapabilities,
  listVoiceConsents,
  revokeVoiceConsentRecord,
} from '../services/generative-media.service.js';

export async function registerGenerativeRoutes(
  app: FastifyInstance,
  storage?: MinioStorageAdapter,
): Promise<void> {
  // 1. Provider Capability Registry with honest live/pending-credentials status
  app.get('/api/v1/generative/providers', async (request, reply) => {
    await authorizeWorkspace(request, 'VIEWER');
    return reply.status(200).send({
      success: true,
      data: {
        providers: listProviderCapabilities(),
      },
    });
  });

  // 2. List workspace generative jobs
  app.get('/api/v1/generative/jobs', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const query = request.query as { projectId?: string };
    const jobs = await listGenerativeJobs({
      workspaceId: ctx.workspaceId,
      projectId: query.projectId,
    });
    return reply.status(200).send({
      success: true,
      data: { jobs },
    });
  });

  // 3. Create generative asset job (enforces idempotency, rights/voice consent, cost estimate)
  app.post('/api/v1/generative/jobs', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreateGenerativeJobRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid generative job request payload', parsed.error.flatten());
    }
    const job = await createGenerativeAssetJob({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
      storage,
    });
    return reply.status(201).send({
      success: true,
      data: job,
    });
  });

  // 4. Accept or Reject a generated asset (ACCEPT saves to Media Library + optional storyboard scene patch)
  app.post('/api/v1/generative/jobs/:jobId/decision', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { jobId } = request.params as { jobId: string };
    const parsed = GenerativeJobDecisionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid generative decision payload', parsed.error.flatten());
    }
    const result = await decideGenerativeJob({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      jobId,
      input: parsed.data,
    });
    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // 5. Voice Cloning Consent Governance
  app.get('/api/v1/generative/voice-consents', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const consents = await listVoiceConsents(ctx.workspaceId);
    return reply.status(200).send({
      success: true,
      data: { consents },
    });
  });

  app.post('/api/v1/generative/voice-consents', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const parsed = CreateVoiceConsentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid voice consent payload', parsed.error.flatten());
    }
    const consent = await createVoiceConsentRecord({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(201).send({
      success: true,
      data: consent,
    });
  });

  app.post('/api/v1/generative/voice-consents/:consentId/revoke', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const { consentId } = request.params as { consentId: string };
    const revoked = await revokeVoiceConsentRecord({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      consentId,
    });
    return reply.status(200).send({
      success: true,
      data: revoked,
    });
  });
}
