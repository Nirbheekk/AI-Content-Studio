import { describe, expect, it } from 'vitest';
import { prisma } from '@ai-content-os/database';
import { buildApiServer } from '../server.js';

describe('@ai-content-os/api Phase 4 Social Publishing & Content Calendar End-to-End', () => {
  const suffix = Date.now();
  const ownerEmail = `publish.owner.${suffix}@aicontent.studio`;
  const viewerEmail = `publish.viewer.${suffix}@aicontent.studio`;

  let ownerToken = '';
  let viewerToken = '';
  let workspaceId = '';
  let projectId = '';
  let compositionId = '';
  let tiktokAccountId = '';
  let youtubeShortsAccountId = '';
  let linkedinAccountId = '';
  let xAccountId = '';

  it('completes OAuth Account Connect & AES-256-GCM Encryption -> Health Check & Token Refresh -> Platform Capability Validation -> Human Approval Gate -> Immediate & Idempotent Publishing -> Scheduled Publishing & Calendar Views -> Drag-and-Drop Reschedule & Cancel -> Rate-Limit Retry & Recovery -> RBAC Isolation', async () => {
    const app = await buildApiServer();

    // 1. Register workspace OWNER and a second user who will be added as VIEWER
    const regOwner = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: ownerEmail,
        password: 'PublishPassword!2026',
        fullName: 'Phase 4 Publishing Lead',
        workspaceName: 'Social Publishing Studio',
      },
    });
    expect(regOwner.statusCode).toBe(201);
    const ownerData = regOwner.json() as {
      data: { accessToken: string; activeWorkspaceId: string };
    };
    ownerToken = ownerData.data.accessToken;
    workspaceId = ownerData.data.activeWorkspaceId;

    const regViewer = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: viewerEmail,
        password: 'ViewerPassword!2026',
        fullName: 'Phase 4 Read-Only Reviewer',
        workspaceName: 'Viewer Personal Workspace',
      },
    });
    expect(regViewer.statusCode).toBe(201);
    const viewerData = regViewer.json() as {
      data: { accessToken: string; user: { id: string } };
    };
    viewerToken = viewerData.data.accessToken;

    // Add viewer user as VIEWER in the publishing workspace
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: viewerData.data.user.id,
        role: 'VIEWER',
      },
    });

    // 2. Create project and an unapproved (DRAFT) composition
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        name: 'Q4 Social Launch Campaign',
        description: 'Multi-platform product launch campaign',
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = (projRes.json() as { data: { id: string } }).data.id;

    const comp = await prisma.composition.create({
      data: {
        workspaceId,
        projectId,
        title: 'Product Launch Vertical Reel',
        targetPlatform: 'INSTAGRAM_REELS',
        aspectRatio: 'PORTRAIT_9_16',
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 900, // 30 seconds
        approvalStatus: 'DRAFT',
      },
    });
    compositionId = comp.id;

    // 3. OAuth URL Generation & Account Connection (AES-256-GCM encryption + zero credential leak)
    const oauthUrlRes = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/oauth-url',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'TIKTOK',
      },
    });
    expect(oauthUrlRes.statusCode).toBe(200);
    const oauthUrlBody = oauthUrlRes.json() as {
      data: { authorizationUrl: string; requiredScopes: string[] };
    };
    expect(oauthUrlBody.data.authorizationUrl).toContain('oauth/tiktok/authorize');
    expect(oauthUrlBody.data.requiredScopes).toContain('video.publish');

    // Connect TikTok account (with simulated expired token to test health check + token refresh)
    const connectTiktok = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/connect',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'TIKTOK',
        code: 'oauth_tiktok_code_001',
        accountName: 'Studio TikTok',
        accountHandle: '@studio_tiktok',
        simulateExpiredToken: true,
      },
    });
    expect(connectTiktok.statusCode).toBe(201);
    const tiktokBody = connectTiktok.json() as {
      data: {
        account: {
          id: string;
          status: string;
          tokenPreview: string;
          encryptedAccessToken?: string;
          encryptedRefreshToken?: string;
        };
      };
    };
    tiktokAccountId = tiktokBody.data.account.id;
    expect(tiktokBody.data.account.status).toBe('EXPIRED');
    expect(tiktokBody.data.account.tokenPreview).toMatch(/^\*\*\*\*/);
    // Verify encrypted tokens are NEVER exposed in API response
    expect(tiktokBody.data.account.encryptedAccessToken).toBeUndefined();
    expect(tiktokBody.data.account.encryptedRefreshToken).toBeUndefined();

    // Verify AES-256-GCM format in PostgreSQL directly
    const dbAccount = await prisma.socialAccount.findUniqueOrThrow({
      where: { id: tiktokAccountId },
    });
    expect(dbAccount.encryptedAccessToken).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(dbAccount.encryptedRefreshToken).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    // Run health check -> confirms EXPIRED status
    const healthRes = await app.inject({
      method: 'POST',
      url: `/api/v1/publishing/accounts/${tiktokAccountId}/health-check`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {},
    });
    expect(healthRes.statusCode).toBe(200);
    expect(
      (healthRes.json() as { data: { health: { healthy: boolean; status: string } } }).data.health
        .healthy,
    ).toBe(false);

    // Rotate/Refresh token -> restores CONNECTED status
    const refreshRes = await app.inject({
      method: 'POST',
      url: `/api/v1/publishing/accounts/${tiktokAccountId}/refresh`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {},
    });
    expect(refreshRes.statusCode).toBe(200);
    expect(
      (refreshRes.json() as { data: { account: { status: string } } }).data.account.status,
    ).toBe('CONNECTED');

    // Connect YouTube Shorts, LinkedIn, and X accounts
    const connectYt = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/connect',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'YOUTUBE_SHORTS',
        code: 'oauth_yt_code_002',
        accountName: 'Studio YouTube',
        accountHandle: '@studio_yt',
      },
    });
    expect(connectYt.statusCode).toBe(201);
    youtubeShortsAccountId = (
      connectYt.json() as { data: { account: { id: string } } }
    ).data.account.id;

    const connectLi = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/connect',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'LINKEDIN',
        code: 'oauth_li_code_003',
        accountName: 'Studio LinkedIn',
        accountHandle: '@studio_linkedin',
      },
    });
    expect(connectLi.statusCode).toBe(201);
    linkedinAccountId = (
      connectLi.json() as { data: { account: { id: string } } }
    ).data.account.id;

    const connectX = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/connect',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'X_TWITTER',
        code: 'oauth_x_code_004',
        accountName: 'Studio X',
        accountHandle: '@studio_x',
      },
    });
    expect(connectX.statusCode).toBe(201);
    xAccountId = (connectX.json() as { data: { account: { id: string } } }).data.account.id;

    // 4. Platform-Specific Capability Validation
    // 4a. Reject WRITTEN text-only post on TikTok
    const invalidTiktokWritten = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: tiktokAccountId,
        contentType: 'WRITTEN',
        captionText: 'Text-only post on TikTok should fail validation',
        hashtags: ['tiktok'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(invalidTiktokWritten.statusCode).toBe(400);

    // 4b. Reject YouTube Shorts video without required title
    const invalidYtNoTitle = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: youtubeShortsAccountId,
        contentType: 'VIDEO',
        compositionId,
        captionText: 'YouTube Short without a title',
        hashtags: ['shorts'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(invalidYtNoTitle.statusCode).toBe(400);

    // 4c. Reject X/Twitter post over 280 characters
    const invalidXLength = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: xAccountId,
        contentType: 'WRITTEN',
        captionText: 'X'.repeat(300),
        hashtags: [],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(invalidXLength.statusCode).toBe(400);

    // 5. Human Approval Gate Enforcement
    // Attempting to publish unapproved composition with explicitApprovalConfirmed: false MUST fail with 403
    const unapprovedAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: tiktokAccountId,
        contentType: 'VIDEO',
        compositionId,
        captionText: 'Trying to bypass human approval gate',
        hashtags: ['ai'],
        publishImmediately: true,
        explicitApprovalConfirmed: false,
      },
    });
    expect(unapprovedAttempt.statusCode).toBe(403);

    // 6. Immediate Publishing + Duplicate Prevention via Idempotency Key
    const customIdempotencyKey = `pub-idem-test-${suffix}`;
    const publishSuccess = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: tiktokAccountId,
        contentType: 'VIDEO',
        compositionId,
        captionText: 'Approved vertical reel ready for TikTok launch!',
        hashtags: ['ai', 'remotion', 'launch'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
        idempotencyKey: customIdempotencyKey,
      },
    });
    expect(publishSuccess.statusCode).toBe(201);
    const publishedPost = (
      publishSuccess.json() as {
        data: {
          post: {
            id: string;
            status: string;
            providerStatus: string;
            externalPostId: string;
            isSimulated: boolean;
            attempts: unknown[];
          };
          deduplicated: boolean;
        };
      }
    ).data;
    expect(publishedPost.deduplicated).toBe(false);
    expect(publishedPost.post.status).toBe('PUBLISHED');
    expect(publishedPost.post.providerStatus).toBe('PUBLISHED');
    expect(publishedPost.post.externalPostId).toContain('sim_postiz_tiktok_');
    expect(publishedPost.post.attempts).toHaveLength(1);

    // Re-submitting identical idempotency key returns 200 deduplicated without creating a 2nd attempt
    const duplicateSubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: tiktokAccountId,
        contentType: 'VIDEO',
        compositionId,
        captionText: 'Approved vertical reel ready for TikTok launch!',
        hashtags: ['ai', 'remotion', 'launch'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
        idempotencyKey: customIdempotencyKey,
      },
    });
    expect(duplicateSubmit.statusCode).toBe(200);
    const dupData = (
      duplicateSubmit.json() as {
        data: { deduplicated: boolean; post: { id: string; attempts: unknown[] } };
      }
    ).data;
    expect(dupData.deduplicated).toBe(true);
    expect(dupData.post.id).toBe(publishedPost.post.id);
    expect(dupData.post.attempts).toHaveLength(1);

    // 7. Provider Processing State Rule: Never report PUBLISHED until provider confirms
    const processingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: linkedinAccountId,
        contentType: 'WRITTEN',
        captionText: 'Async provider transcode test [SIMULATE_PROVIDER_PROCESSING]',
        hashtags: ['engineering'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(processingRes.statusCode).toBe(201);
    const processingPost = (
      processingRes.json() as {
        data: { post: { status: string; providerStatus: string; publishedAt: string | null } };
      }
    ).data.post;
    expect(processingPost.status).toBe('PUBLISHING');
    expect(processingPost.providerStatus).toBe('PROCESSING');
    expect(processingPost.publishedAt).toBeNull();

    // 8. Scheduled Publishing, Interactive Content Calendar, Drag-and-Drop Rescheduling & Cancellation
    const futureDate1 = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    const scheduleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: youtubeShortsAccountId,
        contentType: 'VIDEO',
        compositionId,
        title: 'AI Content OS — 30s Demo Short',
        captionText: 'Scheduled YouTube Short for global launch',
        hashtags: ['shorts', 'ai'],
        scheduledFor: futureDate1.toISOString(),
        timezone: 'America/New_York',
        publishImmediately: false,
        explicitApprovalConfirmed: true,
      },
    });
    expect(scheduleRes.statusCode).toBe(201);
    const scheduledPost = (
      scheduleRes.json() as {
        data: { post: { id: string; status: string; timezone: string } };
      }
    ).data.post;
    expect(scheduledPost.status).toBe('SCHEDULED');
    expect(scheduledPost.timezone).toBe('America/New_York');

    // Query Interactive Content Calendar (Month, Week, Day views + Platform filter)
    const calMonthRes = await app.inject({
      method: 'GET',
      url: `/api/v1/calendar?view=month&anchorDate=${encodeURIComponent(futureDate1.toISOString())}&timezone=America/New_York&platform=YOUTUBE_SHORTS`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(calMonthRes.statusCode).toBe(200);
    const calMonth = (
      calMonthRes.json() as {
        data: { totalCount: number; entries: Array<{ id: string; platform: string }> };
      }
    ).data;
    expect(calMonth.totalCount).toBeGreaterThanOrEqual(1);
    expect(calMonth.entries.some((e) => e.id === scheduledPost.id)).toBe(true);

    // Edit scheduled post caption & title
    const editPostRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/publishing/posts/${scheduledPost.id}`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        title: 'Updated: AI Content OS — 30s Demo',
        captionText: 'Updated scheduled description for YouTube Shorts',
      },
    });
    expect(editPostRes.statusCode).toBe(200);

    // Drag-and-drop reschedule to +3 days
    const futureDate2 = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const rescheduleRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/publishing/posts/${scheduledPost.id}/reschedule`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        scheduledFor: futureDate2.toISOString(),
        timezone: 'Europe/London',
      },
    });
    expect(rescheduleRes.statusCode).toBe(200);
    const rescheduled = (
      rescheduleRes.json() as {
        data: { post: { scheduledFor: string; timezone: string; status: string } };
      }
    ).data.post;
    expect(rescheduled.scheduledFor).toBe(futureDate2.toISOString());
    expect(rescheduled.timezone).toBe('Europe/London');

    // Cancel scheduled post
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/publishing/posts/${scheduledPost.id}/cancel`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {},
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(
      (cancelRes.json() as { data: { post: { status: string } } }).data.post.status,
    ).toBe('CANCELLED');

    // 9. Rate-Limit Error Classification, Exponential Backoff & Manual Retry Recovery
    const rateLimitedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: xAccountId,
        contentType: 'WRITTEN',
        captionText: 'Launch announcement thread! [SIMULATE_RATE_LIMIT]',
        hashtags: ['ai', 'launch'],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(rateLimitedRes.statusCode).toBe(201);
    const failedPost = (
      rateLimitedRes.json() as {
        data: {
          post: {
            id: string;
            status: string;
            providerStatus: string;
            retryCount: number;
            nextRetryAt: string | null;
            attempts: Array<{ errorCategory: string; httpStatus: number }>;
          };
        };
      }
    ).data.post;
    expect(failedPost.status).toBe('FAILED');
    expect(failedPost.retryCount).toBe(1);
    expect(failedPost.nextRetryAt).not.toBeNull();
    expect(failedPost.attempts[0]?.errorCategory).toBe('RATE_LIMIT');
    expect(failedPost.attempts[0]?.httpStatus).toBe(429);

    // Retry and recover the failed post
    const retryRes = await app.inject({
      method: 'POST',
      url: `/api/v1/publishing/posts/${failedPost.id}/retry`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        clearSimulationFaults: true,
      },
    });
    expect(retryRes.statusCode).toBe(200);
    const recoveredPost = (
      retryRes.json() as {
        data: {
          post: {
            status: string;
            providerStatus: string;
            externalPostId: string | null;
            attempts: unknown[];
          };
        };
      }
    ).data.post;
    expect(recoveredPost.status).toBe('PUBLISHED');
    expect(recoveredPost.providerStatus).toBe('PUBLISHED');
    expect(recoveredPost.externalPostId).toContain('sim_postiz_x_twitter_');
    expect(recoveredPost.attempts).toHaveLength(2);

    // 10. RBAC Enforcement: VIEWER can view dashboard & calendar, but cannot connect accounts or publish
    const viewerDashboard = await app.inject({
      method: 'GET',
      url: '/api/v1/publishing/dashboard',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'X-Workspace-Id': workspaceId,
      },
    });
    expect(viewerDashboard.statusCode).toBe(200);

    const viewerConnectForbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/accounts/connect',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        platform: 'FACEBOOK',
        code: 'code_123',
        accountName: 'Forbidden Account',
        accountHandle: '@forbidden',
      },
    });
    expect(viewerConnectForbidden.statusCode).toBe(403);

    const viewerPublishForbidden = await app.inject({
      method: 'POST',
      url: '/api/v1/publishing/posts',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'X-Workspace-Id': workspaceId,
      },
      payload: {
        socialAccountId: xAccountId,
        contentType: 'WRITTEN',
        captionText: 'Viewer attempting to publish',
        hashtags: [],
        publishImmediately: true,
        explicitApprovalConfirmed: true,
      },
    });
    expect(viewerPublishForbidden.statusCode).toBe(403);

    await app.close();
  });
});
