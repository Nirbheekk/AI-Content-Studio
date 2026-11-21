import type { FastifyInstance } from 'fastify';
import {
  CalendarQuerySchema,
  CompleteOAuthConnectSchema,
  CreatePublishPostRequestSchema,
  InitiateOAuthConnectSchema,
  NotFoundError,
  PLATFORM_PUBLISHING_CAPABILITIES,
  ReschedulePublishPostSchema,
  TargetPlatformSchema,
  UpdatePublishPostSchema,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { authorizeWorkspace } from '../middleware/auth.js';
import {
  cancelPublishPost,
  checkSocialAccountConnectionHealth,
  connectSocialAccountForWorkspace,
  createOrSchedulePublishPost,
  executePostPublication,
  formatPublishPostResponse,
  getCalendarEntries,
  postizAdapter,
  refreshSocialAccountTokens,
  reschedulePublishPost,
  sanitizeSocialAccount,
  updatePublishPostContent,
} from '../services/publishing.service.js';

const SUPPORTED_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export async function registerPublishingRoutes(
  app: FastifyInstance,
  storage?: MinioStorageAdapter,
): Promise<void> {
  // 1. Platform Capabilities & Provider Configuration Status
  app.get('/api/v1/publishing/capabilities', async (request, reply) => {
    await authorizeWorkspace(request, 'VIEWER');

    return reply.status(200).send({
      success: true,
      data: {
        provider: postizAdapter.isLiveConfigured() ? 'postiz-live' : 'postiz-sandbox-fallback',
        isLiveConfigured: postizAdapter.isLiveConfigured(),
        supportedTimezones: SUPPORTED_TIMEZONES,
        capabilities: PLATFORM_PUBLISHING_CAPABILITIES,
      },
    });
  });

  // 2. Generate OAuth Connect URL (ADMIN+)
  app.post('/api/v1/publishing/accounts/oauth-url', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const parsed = InitiateOAuthConnectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid OAuth initialization payload', parsed.error.flatten());
    }

    const oauthData = postizAdapter.getOAuthAuthorizationUrl({
      platform: parsed.data.platform,
      workspaceId,
      redirectUri: parsed.data.redirectUri,
    });

    return reply.status(200).send({
      success: true,
      data: oauthData,
    });
  });

  // 3. Complete OAuth Account Connection (ADMIN+)
  app.post('/api/v1/publishing/accounts/connect', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const parsed = CompleteOAuthConnectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid OAuth account connection payload',
        parsed.error.flatten(),
      );
    }

    const result = await connectSocialAccountForWorkspace({
      workspaceId,
      userId,
      input: parsed.data,
    });

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // 4. List Connected Social Accounts (VIEWER+)
  app.get('/api/v1/publishing/accounts', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.status(200).send({
      success: true,
      data: {
        accounts: accounts.map(sanitizeSocialAccount),
        isSimulatedProvider: !postizAdapter.isLiveConfigured(),
      },
    });
  });

  // 5. Refresh OAuth Access/Refresh Tokens (ADMIN+)
  app.post('/api/v1/publishing/accounts/:accountId/refresh', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const { accountId } = request.params as { accountId: string };

    const refreshed = await refreshSocialAccountTokens({
      workspaceId,
      accountId,
      userId,
    });

    return reply.status(200).send({
      success: true,
      data: {
        account: refreshed.account,
        isSimulated: refreshed.isSimulated,
      },
    });
  });

  // 6. Run Account Permission & Connection Health Check (VIEWER+)
  app.post('/api/v1/publishing/accounts/:accountId/health-check', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const { accountId } = request.params as { accountId: string };

    const result = await checkSocialAccountConnectionHealth({
      workspaceId,
      accountId,
    });

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // 7. Disconnect / Remove Social Account (ADMIN+)
  app.delete('/api/v1/publishing/accounts/:accountId', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'ADMIN');
    const { accountId } = request.params as { accountId: string };

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
      include: {
        _count: {
          select: { publishPosts: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundError('SocialAccount', accountId);
    }

    if (account._count.publishPosts > 0) {
      await prisma.publishPost.updateMany({
        where: {
          socialAccountId: account.id,
          status: { in: ['DRAFT', 'SCHEDULED'] },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      const revoked = await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          status: 'REVOKED',
          connectionError: 'Disconnected by workspace administrator',
          lastHealthCheckAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'SOCIAL_ACCOUNT_DISCONNECTED',
          entityType: 'SocialAccount',
          entityId: account.id,
          detailsJson: { mode: 'revoked_with_history', platform: account.platform },
        },
      });

      return reply.status(200).send({
        success: true,
        data: {
          disconnected: true,
          mode: 'REVOKED',
          account: sanitizeSocialAccount(revoked),
        },
      });
    }

    await prisma.socialAccount.delete({
      where: { id: account.id },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'SOCIAL_ACCOUNT_DISCONNECTED',
        entityType: 'SocialAccount',
        entityId: account.id,
        detailsJson: { mode: 'deleted', platform: account.platform },
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        disconnected: true,
        mode: 'DELETED',
      },
    });
  });

  // 8. Publishing Dashboard Overview (VIEWER+)
  app.get('/api/v1/publishing/dashboard', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');

    const [accounts, posts, compositions, renderJobs, assets] = await Promise.all([
      prisma.socialAccount.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.publishPost.findMany({
        where: { workspaceId },
        include: {
          socialAccount: true,
          attempts: { orderBy: { attemptNumber: 'desc' } },
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      prisma.composition.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      prisma.renderJob.findMany({
        where: { workspaceId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.asset.findMany({
        where: { workspaceId, status: 'READY' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const latestRenderByComp = new Map<string, string>();
    for (const rj of renderJobs) {
      if (!latestRenderByComp.has(rj.compositionId)) {
        latestRenderByComp.set(rj.compositionId, rj.id);
      }
    }

    const formattedPosts = posts.map(formatPublishPostResponse);
    const upcomingScheduled = formattedPosts.filter((p) => p.status === 'SCHEDULED');
    const publishingQueue = formattedPosts.filter(
      (p) => p.status === 'PUBLISHING' || p.status === 'APPROVED',
    );
    const recentlyPublished = formattedPosts.filter((p) => p.status === 'PUBLISHED');
    const failedJobs = formattedPosts.filter((p) => p.status === 'FAILED');
    const deadLetterJobs = failedJobs.filter((p) => p.providerStatus === 'DEAD_LETTER');

    return reply.status(200).send({
      success: true,
      data: {
        provider: postizAdapter.isLiveConfigured() ? 'postiz-live' : 'postiz-sandbox-fallback',
        isSimulatedProvider: !postizAdapter.isLiveConfigured(),
        supportedTimezones: SUPPORTED_TIMEZONES,
        capabilities: PLATFORM_PUBLISHING_CAPABILITIES,
        accounts: accounts.map(sanitizeSocialAccount),
        compositions: compositions.map((c) => ({
          id: c.id,
          title: c.title,
          aspectRatio: c.aspectRatio,
          approvalStatus: c.approvalStatus,
          approvedByUserId: c.approvedByUserId,
          approvedAt: c.approvedAt ? c.approvedAt.toISOString() : null,
          latestRenderJobId: latestRenderByComp.get(c.id) ?? null,
        })),
        readyAssets: assets.map((a) => ({
          id: a.id,
          name: a.originalName,
          assetType: a.assetType,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          durationSec: a.durationSec,
        })),
        upcomingScheduled,
        publishingQueue,
        recentlyPublished,
        failedJobs,
        allPosts: formattedPosts,
        stats: {
          connectedAccounts: accounts.filter((a) => a.status === 'CONNECTED').length,
          totalAccounts: accounts.length,
          scheduledCount: upcomingScheduled.length,
          publishingCount: publishingQueue.length,
          publishedCount: recentlyPublished.length,
          failedCount: failedJobs.length,
          deadLetterCount: deadLetterJobs.length,
        },
      },
    });
  });

  // 9. Create, Schedule, or Publish Post (EDITOR+)
  app.post('/api/v1/publishing/posts', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const parsed = CreatePublishPostRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid publish post request payload', parsed.error.flatten());
    }

    const result = await createOrSchedulePublishPost({
      workspaceId,
      userId,
      input: parsed.data,
      storage,
    });

    return reply.status(result.deduplicated ? 200 : 201).send({
      success: true,
      data: result,
    });
  });

  // 10. List Publish Posts with Filters (VIEWER+)
  app.get('/api/v1/publishing/posts', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const platformFilter = query['platform']
      ? TargetPlatformSchema.safeParse(query['platform'])
      : undefined;

    const posts = await prisma.publishPost.findMany({
      where: {
        workspaceId,
        ...(platformFilter?.success ? { platform: platformFilter.data } : {}),
        ...(query['socialAccountId'] ? { socialAccountId: query['socialAccountId'] } : {}),
        ...(query['status'] ? { status: query['status'] as never } : {}),
      },
      include: {
        socialAccount: true,
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
    });

    return reply.status(200).send({
      success: true,
      data: {
        posts: posts.map(formatPublishPostResponse),
      },
    });
  });

  // 11. Update Post Caption, Title, or Hashtags (EDITOR+)
  app.patch('/api/v1/publishing/posts/:postId', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };
    const parsed = UpdatePublishPostSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid post update payload', parsed.error.flatten());
    }

    const updated = await updatePublishPostContent({
      workspaceId,
      publishPostId: postId,
      userId,
      input: parsed.data,
    });

    return reply.status(200).send({
      success: true,
      data: { post: updated },
    });
  });

  // 12. Drag-and-Drop / Calendar Reschedule Post (EDITOR+)
  app.patch('/api/v1/publishing/posts/:postId/reschedule', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };
    const parsed = ReschedulePublishPostSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid reschedule payload', parsed.error.flatten());
    }

    const rescheduled = await reschedulePublishPost({
      workspaceId,
      publishPostId: postId,
      userId,
      input: parsed.data,
    });

    return reply.status(200).send({
      success: true,
      data: { post: rescheduled },
    });
  });

  // 13. Immediately Execute Publication of Scheduled/Approved Post (EDITOR+)
  app.post('/api/v1/publishing/posts/:postId/publish', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };

    const post = await executePostPublication({
      workspaceId,
      publishPostId: postId,
      userId,
      storage,
    });

    return reply.status(200).send({
      success: true,
      data: { post },
    });
  });

  // 14. Retry Failed or Dead-Letter Publishing Job (EDITOR+)
  app.post('/api/v1/publishing/posts/:postId/retry', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };
    const body = (request.body ?? {}) as { clearSimulationFaults?: boolean };

    const existing = await prisma.publishPost.findFirst({
      where: { id: postId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundError('PublishPost', postId);
    }

    if (body.clearSimulationFaults) {
      const cleanedCaption = existing.captionText
        .replace(/\[SIMULATE_RATE_LIMIT\]/g, '')
        .replace(/\[SIMULATE_TRANSIENT_ERROR\]/g, '')
        .replace(/\[SIMULATE_AUTH_REVOKED\]/g, '')
        .trim();
      await prisma.publishPost.update({
        where: { id: existing.id },
        data: {
          captionText: cleanedCaption || existing.captionText,
        },
      });
    }

    const retried = await executePostPublication({
      workspaceId,
      publishPostId: postId,
      userId,
      storage,
    });

    return reply.status(200).send({
      success: true,
      data: { post: retried },
    });
  });

  // 15. Cancel Scheduled or Draft Post (EDITOR+)
  app.post('/api/v1/publishing/posts/:postId/cancel', async (request, reply) => {
    const { userId, workspaceId } = await authorizeWorkspace(request, 'EDITOR');
    const { postId } = request.params as { postId: string };

    const cancelled = await cancelPublishPost({
      workspaceId,
      publishPostId: postId,
      userId,
    });

    return reply.status(200).send({
      success: true,
      data: { post: cancelled },
    });
  });

  // 16. Interactive Content Calendar Query (VIEWER+)
  app.get('/api/v1/calendar', async (request, reply) => {
    const { workspaceId } = await authorizeWorkspace(request, 'VIEWER');
    const parsed = CalendarQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid calendar query parameters', parsed.error.flatten());
    }

    const calendarData = await getCalendarEntries({
      workspaceId,
      query: parsed.data,
    });

    return reply.status(200).send({
      success: true,
      data: calendarData,
    });
  });
}
