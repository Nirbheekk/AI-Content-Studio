import {
  ImportAuthorizedMetricsRequest,
  NotFoundError,
  ReschedulePublishPostRequest,
  SOCIAL_PLATFORM_CAPABILITIES,
  SocialPlatformCapabilitySpec,
  ValidateDeliverableRequest,
  ValidationError,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { evaluatePublishRightsGate } from './media-rights.service.js';

export interface EvaluatedSocialPlatformCapability extends SocialPlatformCapabilitySpec {
  postizConfigured: boolean;
  integrationState: 'SANDBOX_SIMULATED' | 'REQUIRES_OAUTH_AND_APPROVAL';
}

export function listSocialPlatformCapabilities(): EvaluatedSocialPlatformCapability[] {
  const postizKey = process.env['POSTIZ_API_KEY']?.trim();
  const postizConfigured = Boolean(postizKey && postizKey.length > 8 && !postizKey.startsWith('your-'));

  return SOCIAL_PLATFORM_CAPABILITIES.map((spec) => ({
    ...spec,
    postizConfigured,
    integrationState: postizConfigured ? 'REQUIRES_OAUTH_AND_APPROVAL' : 'SANDBOX_SIMULATED',
  }));
}

export async function validateDeliverableForPlatform(params: {
  workspaceId: string;
  userId: string;
  input: ValidateDeliverableRequest;
}) {
  const { workspaceId, userId, input } = params;
  const spec = SOCIAL_PLATFORM_CAPABILITIES.find((p) => p.platform === input.platform);
  if (!spec) {
    throw new ValidationError(`Unsupported platform "${input.platform}"`);
  }

  const checks: Array<{
    checkId: string;
    passed: boolean;
    measuredValue: string;
    limit: string;
    blocking: boolean;
  }> = [];

  // 1. Aspect Ratio
  const ratioOk = spec.supportedAspectRatios.includes(input.aspectRatio);
  checks.push({
    checkId: 'aspect-ratio',
    passed: ratioOk,
    measuredValue: input.aspectRatio,
    limit: spec.supportedAspectRatios.join(', '),
    blocking: !ratioOk,
  });

  // 2. Duration
  const durOk = input.durationSec <= spec.maxDurationSec;
  checks.push({
    checkId: 'duration-limit',
    passed: durOk,
    measuredValue: `${input.durationSec}s`,
    limit: `<= ${spec.maxDurationSec}s`,
    blocking: !durOk,
  });

  // 3. File Size
  const sizeOk = input.fileSizeMb <= spec.maxFileSizeMb;
  checks.push({
    checkId: 'file-size-limit',
    passed: sizeOk,
    measuredValue: `${input.fileSizeMb} MB`,
    limit: `<= ${spec.maxFileSizeMb} MB`,
    blocking: !sizeOk,
  });

  // 4. Caption Length
  const captionOk = input.caption.length <= spec.maxCaptionChars;
  checks.push({
    checkId: 'caption-length',
    passed: captionOk,
    measuredValue: `${input.caption.length} chars`,
    limit: `<= ${spec.maxCaptionChars} chars`,
    blocking: !captionOk,
  });

  // 5. Hashtags Count
  const hashOk = input.hashtags.length <= spec.maxHashtags;
  checks.push({
    checkId: 'hashtag-limit',
    passed: hashOk,
    measuredValue: `${input.hashtags.length} hashtags`,
    limit: `<= ${spec.maxHashtags} hashtags`,
    blocking: false,
  });

  // 6. Composition Approval Check (if compositionId supplied)
  if (input.compositionId) {
    const comp = await prisma.composition.findFirst({
      where: { id: input.compositionId, workspaceId },
    });
    if (!comp) {
      throw new NotFoundError('Composition not found in workspace');
    }
    const approved = comp.approvalStatus === 'APPROVED';
    checks.push({
      checkId: 'human-approval-gate',
      passed: approved,
      measuredValue: comp.approvalStatus,
      limit: 'APPROVED',
      blocking: !approved,
    });
  }

  // 7. Media Rights Gate (if assetId or compositionId supplied)
  if (input.assetId || input.compositionId) {
    const rights = await evaluatePublishRightsGate({
      workspaceId,
      userId,
      assetId: input.assetId ?? null,
      compositionId: input.compositionId ?? null,
      platform: input.platform,
    });
    const rightsOk = rights.decision !== 'BLOCKED';
    checks.push({
      checkId: 'media-rights-gate',
      passed: rightsOk,
      measuredValue: rights.decision,
      limit: 'NOT BLOCKED',
      blocking: !rightsOk,
    });
  }

  const blockingReasons = checks
    .filter((c) => c.blocking)
    .map((c) => `${c.checkId}: ${c.measuredValue} violates ${c.limit}`);

  return {
    platform: spec.platform,
    displayName: spec.displayName,
    valid: blockingReasons.length === 0,
    blockingReasons,
    checks,
  };
}

export async function reschedulePublishPost(params: {
  workspaceId: string;
  userId: string;
  postId: string;
  input: ReschedulePublishPostRequest;
}) {
  const post = await prisma.publishPost.findFirst({
    where: { id: params.postId, workspaceId: params.workspaceId },
  });
  if (!post) {
    throw new NotFoundError('Scheduled post not found in workspace');
  }
  if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
    throw new ValidationError(`Cannot reschedule a post in status "${post.status}".`);
  }

  const nextTime = new Date(params.input.scheduledFor);
  const updated = await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      scheduledFor: nextTime,
      timezone: params.input.timezone,
      status: 'SCHEDULED',
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'PUBLISH_POST_RESCHEDULED',
      entityType: 'PublishPost',
      entityId: post.id,
      detailsJson: {
        previousScheduledFor: post.scheduledFor?.toISOString() ?? null,
        scheduledFor: nextTime.toISOString(),
        timezone: params.input.timezone,
      },
    },
  });

  return updated;
}

export async function importAuthorizedAnalyticsMetrics(params: {
  workspaceId: string;
  userId: string;
  input: ImportAuthorizedMetricsRequest;
}) {
  const { workspaceId, userId, input } = params;

  let targetPostId = input.publishPostId;
  if (targetPostId) {
    const post = await prisma.publishPost.findFirst({
      where: { id: targetPostId, workspaceId },
    });
    if (!post) throw new NotFoundError('PublishPost not found in workspace');
  } else {
    const anyPost = await prisma.publishPost.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!anyPost) {
      throw new ValidationError(
        'No PublishPost found in workspace. Create or schedule a post before importing authorized metrics.',
      );
    }
    targetPostId = anyPost.id;
  }

  const targetPlatform =
    input.platform === 'X'
      ? ('LINKEDIN' as const)
      : (input.platform as
          | 'INSTAGRAM_REELS'
          | 'FACEBOOK'
          | 'TIKTOK'
          | 'YOUTUBE_SHORTS'
          | 'LINKEDIN');

  const snapshot = await prisma.analyticsSnapshot.create({
    data: {
      workspaceId,
      publishPostId: targetPostId,
      platform: targetPlatform,
      source: input.provenance === 'ACTUAL_PLATFORM' ? 'POSTIZ_API' : 'MANUAL_IMPORT',
      collectedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      watchTimeSec: input.avgWatchSec ?? null,
      unavailableMetrics:
        input.avgWatchSec === undefined ? ['watchTimeSec', 'completionRate'] : ['completionRate'],
      unavailableReason:
        input.provenance === 'USER_IMPORTED'
          ? 'User-imported snapshot; unprovided platform metrics remain explicitly unavailable.'
          : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: 'ANALYTICS_METRICS_IMPORTED',
      entityType: 'AnalyticsSnapshot',
      entityId: snapshot.id,
      detailsJson: {
        provenance: input.provenance,
        platform: input.platform,
        views: input.views,
      },
    },
  });

  return {
    ...snapshot,
    provenance: input.provenance,
  };
}

export async function generateContentIntelligenceReport(workspaceId: string) {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { workspaceId },
    orderBy: { collectedAt: 'desc' },
    take: 100,
  });

  const sampleSize = snapshots.length;
  const sufficientSample = sampleSize >= 2;

  const byPlatform = new Map<
    string,
    { count: number; totalViews: number; totalEngagements: number }
  >();
  for (const s of snapshots) {
    const key = s.platform;
    const prev = byPlatform.get(key) ?? { count: 0, totalViews: 0, totalEngagements: 0 };
    const views = s.views ?? 0;
    const eng = (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0);
    byPlatform.set(key, {
      count: prev.count + 1,
      totalViews: prev.totalViews + views,
      totalEngagements: prev.totalEngagements + eng,
    });
  }

  const platformBreakdown = Array.from(byPlatform.entries()).map(([platform, stats]) => ({
    platform,
    sampleCount: stats.count,
    avgViews: Math.round(stats.totalViews / Math.max(1, stats.count)),
    engagementRatePct:
      stats.totalViews > 0
        ? Math.round((stats.totalEngagements / stats.totalViews) * 10000) / 100
        : null,
  }));

  platformBreakdown.sort((a, b) => (b.engagementRatePct ?? 0) - (a.engagementRatePct ?? 0));
  const topPlatform = platformBreakdown[0];

  const recommendations: string[] = [];
  if (!sufficientSample) {
    recommendations.push(
      'Collect or import at least 2 authorized post snapshots before drawing comparative performance conclusions.',
    );
  } else {
    if (topPlatform) {
      recommendations.push(
        `Highest observed engagement rate is on ${topPlatform.platform} (${topPlatform.engagementRatePct ?? 0}% across ${topPlatform.sampleCount} post(s)); test 2 new hook variations in your next campaign.`,
      );
    }
    recommendations.push(
      'Run A/B opening-3-second hook experiments (Contrarian Insight vs Before-and-After Proof) — recommendations require explicit user authorization before campaign execution.',
    );
  }

  return {
    sampleSize,
    confidenceLevel: sampleSize >= 10 ? 'HIGH' : sampleSize >= 2 ? 'MODERATE' : 'LOW_SAMPLE_SIZE',
    methodologyDisclaimer:
      'Observed engagement patterns show correlation across authorized/imported snapshots only and do not prove causation. Missing platform metrics are never fabricated.',
    provenanceBreakdown: {
      actualPlatformCount: snapshots.filter((s) => s.source === 'POSTIZ_API').length,
      userImportedCount: snapshots.filter((s) => s.source === 'MANUAL_IMPORT').length,
      unavailableCount: snapshots.filter((s) => s.source === 'UNAVAILABLE').length,
    },
    platformBreakdown,
    recommendations,
    autoCampaignModificationEnabled: false,
  };
}
