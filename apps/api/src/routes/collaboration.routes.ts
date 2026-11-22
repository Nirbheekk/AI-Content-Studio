import type { FastifyInstance } from 'fastify';
import {
  CreateInternalApprovalRequestSchema,
  CreateReviewLinkRequestSchema,
  PublicReviewCommentRequestSchema,
  PublicReviewDecisionRequestSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  accessPublicReviewLink,
  createReviewLink,
  listNotifications,
  listReviewLinks,
  markNotificationRead,
  recordInternalApproval,
  revokeReviewLink,
  submitPublicReviewComment,
  submitPublicReviewDecision,
} from '../services/collaboration.service.js';

export async function registerCollaborationRoutes(app: FastifyInstance): Promise<void> {
  // Authenticated workspace collaboration endpoints
  app.get('/api/v1/collaboration/review-links', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const links = await listReviewLinks(ctx.workspaceId);
    return reply.status(200).send({ success: true, data: { links } });
  });

  app.post('/api/v1/collaboration/review-links', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreateReviewLinkRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid review link payload', parsed.error.flatten());
    }
    const created = await createReviewLink({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      input: parsed.data,
    });
    return reply.status(201).send({ success: true, data: created });
  });

  app.post('/api/v1/collaboration/review-links/:linkId/revoke', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'EDITOR');
    const { linkId } = request.params as { linkId: string };
    const revoked = await revokeReviewLink({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      linkId,
    });
    return reply.status(200).send({ success: true, data: revoked });
  });

  app.post('/api/v1/collaboration/approvals', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'ADMIN');
    const parsed = CreateInternalApprovalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid approval record payload', parsed.error.flatten());
    }
    const record = await recordInternalApproval({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      reviewerName: ctx.email,
      input: parsed.data,
    });
    return reply.status(201).send({ success: true, data: record });
  });

  app.get('/api/v1/collaboration/notifications', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const notifications = await listNotifications(ctx.workspaceId);
    return reply.status(200).send({ success: true, data: { notifications } });
  });

  app.post('/api/v1/collaboration/notifications/:notificationId/read', async (request, reply) => {
    const ctx = await authorizeWorkspace(request, 'VIEWER');
    const { notificationId } = request.params as { notificationId: string };
    const updated = await markNotificationRead({
      workspaceId: ctx.workspaceId,
      notificationId,
    });
    return reply.status(200).send({ success: true, data: updated });
  });

  // Public token-gated client review endpoints (no workspace session required)
  app.get('/api/v1/public/review/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const query = request.query as { password?: string };
    const review = await accessPublicReviewLink(token, query.password);
    return reply.status(200).send({ success: true, data: review });
  });

  app.post('/api/v1/public/review/:token/comments', async (request, reply) => {
    const { token } = request.params as { token: string };
    const parsed = PublicReviewCommentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid client review comment payload', parsed.error.flatten());
    }
    const comment = await submitPublicReviewComment({
      rawToken: token,
      input: parsed.data,
    });
    return reply.status(201).send({ success: true, data: comment });
  });

  app.post('/api/v1/public/review/:token/decision', async (request, reply) => {
    const { token } = request.params as { token: string };
    const parsed = PublicReviewDecisionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid client review decision payload', parsed.error.flatten());
    }
    const record = await submitPublicReviewDecision({
      rawToken: token,
      input: parsed.data,
    });
    return reply.status(201).send({ success: true, data: record });
  });
}
