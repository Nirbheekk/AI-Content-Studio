import type { FastifyInstance } from 'fastify';
import {
  CampaignDeliverableDecisionSchema,
  CreateCampaignRequestSchema,
  UpdateCampaignStatusSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  approveCampaignPlan,
  createCampaignFromBrief,
  decideCampaignDeliverable,
  getCampaignDetail,
  listCampaigns,
  retryCampaignTask,
  runCampaignProductionDag,
  updateCampaignStatus,
} from '../services/campaign-orchestrator.service.js';

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/campaigns', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const campaigns = await listCampaigns(ctx.workspaceId);
    return reply.status(200).send({
      success: true,
      data: { campaigns },
    });
  });

  app.get('/api/v1/campaigns/:campaignId', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { campaignId } = request.params as { campaignId: string };
    const campaign = await getCampaignDetail({
      workspaceId: ctx.workspaceId,
      campaignId,
    });
    return reply.status(200).send({
      success: true,
      data: campaign,
    });
  });

  app.post('/api/v1/campaigns', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreateCampaignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid campaign creation payload', parsed.error.flatten());
    }
    const campaign = await createCampaignFromBrief({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(201).send({
      success: true,
      data: campaign,
    });
  });

  app.post('/api/v1/campaigns/:campaignId/approve-plan', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const { campaignId } = request.params as { campaignId: string };
    const campaign = await approveCampaignPlan({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
    });
    return reply.status(200).send({
      success: true,
      data: campaign,
    });
  });

  app.post('/api/v1/campaigns/:campaignId/produce', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { campaignId } = request.params as { campaignId: string };
    const campaign = await runCampaignProductionDag({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
    });
    return reply.status(200).send({
      success: true,
      data: campaign,
    });
  });

  app.post('/api/v1/campaigns/:campaignId/tasks/:taskId/retry', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { campaignId, taskId } = request.params as { campaignId: string; taskId: string };
    const campaign = await retryCampaignTask({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
      taskId,
    });
    return reply.status(200).send({
      success: true,
      data: campaign,
    });
  });

  app.post('/api/v1/campaigns/:campaignId/status', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const { campaignId } = request.params as { campaignId: string };
    const parsed = UpdateCampaignStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid campaign status payload', parsed.error.flatten());
    }
    const campaign = await updateCampaignStatus({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
      input: parsed.data,
    });
    return reply.status(200).send({
      success: true,
      data: campaign,
    });
  });

  app.post(
    '/api/v1/campaigns/:campaignId/deliverables/:deliverableId/decision',
    async (request, reply) => {
      const ctx = await authorizeWorkspace(request, 'ADMIN');
      const { campaignId, deliverableId } = request.params as {
        campaignId: string;
        deliverableId: string;
      };
      const parsed = CampaignDeliverableDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid deliverable decision payload', parsed.error.flatten());
      }
      const campaign = await decideCampaignDeliverable({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        campaignId,
        deliverableId,
        input: parsed.data,
      });
      return reply.status(200).send({
        success: true,
        data: campaign,
      });
    },
  );
}
