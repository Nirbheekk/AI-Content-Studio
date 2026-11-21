import {
  AspectRatio,
  calculatePublishRetryBackoffMs,
  CalendarQuery,
  CompleteOAuthConnectInput,
  computePublishIdempotencyKey,
  CreatePublishPostRequest,
  ForbiddenError,
  formatDateInTimezone,
  isValidIanaTimezone,
  NotFoundError,
  PLATFORM_PUBLISHING_CAPABILITIES,
  PublishContentType,
  ReschedulePublishPostInput,
  SocialConnectionStatus,
  TargetPlatform,
  UpdatePublishPostInput,
  validatePostForPlatform,
  ValidationError,
} from '@ai-content-os/shared';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
  Prisma,
  prisma,
  SocialAccount,
} from '@ai-content-os/database';
import { MinioStorageAdapter, PostizPublishingAdapter } from '@ai-content-os/integrations';
import { cancelScheduledPublishingJob, enqueuePublishingJob } from '../lib/queues.js';

export const postizAdapter = new PostizPublishingAdapter();

export interface SanitizedSocialAccount {
  id: string;
  workspaceId: string;
  platform: TargetPlatform;
  accountName: string;
  accountHandle: string;
  externalAccountId: string;
  tokenPreview: string;
  tokenExpiresAt: string | null;
  isTokenExpired: boolean;
  scopes: string[];
  status: string;
  connectionError: string | null;
  lastHealthCheckAt: string | null;
  capabilities: (typeof PLATFORM_PUBLISHING_CAPABILITIES)[TargetPlatform];
  createdAt: string;
  updatedAt: string;
}

export function sanitizeSocialAccount(account: SocialAccount): SanitizedSocialAccount {
  let tokenPreview = '****';
  try {
    const plain = decryptSecret(account.encryptedAccessToken);
    tokenPreview = maskSecret(plain);
  } catch {
    tokenPreview = '****invalid';
  }

  const isTokenExpired = Boolean(
    account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now(),
  );

  return {
    id: account.id,
    workspaceId: account.workspaceId,
    platform: account.platform,
    accountName: account.accountName,
    accountHandle: account.accountHandle,
    externalAccountId: account.externalAccountId,
    tokenPreview,
    tokenExpiresAt: account.tokenExpiresAt ? account.tokenExpiresAt.toISOString() : null,
    isTokenExpired,
    scopes: account.scopes ?? [],
    status: isTokenExpired && account.status === 'CONNECTED' ? 'EXPIRED' : account.status,
    connectionError: account.connectionError,
    lastHealthCheckAt: account.lastHealthCheckAt
      ? account.lastHealthCheckAt.toISOString()
      : null,
    capabilities: PLATFORM_PUBLISHING_CAPABILITIES[account.platform],
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function inferAspectRatioFromDimensions(
  width?: number | null,
  height?: number | null,
): AspectRatio | undefined {
  if (!width || !height || width <= 0 || height <= 0) {
    return undefined;
  }
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.08) return 'PORTRAIT_9_16';
  if (Math.abs(ratio - 16 / 9) < 0.08) return 'LANDSCAPE_16_9';
  if (Math.abs(ratio - 1) < 0.08) return 'SQUARE_1_1';
  if (Math.abs(ratio - 4 / 5) < 0.08) return 'PORTRAIT_4_5';
  return undefined;
}

export async function connectSocialAccountForWorkspace(params: {
  workspaceId: string;
  userId: string;
  input: CompleteOAuthConnectInput;
}): Promise<{ account: SanitizedSocialAccount; isSimulated: boolean }> {
  let exchanged;
  try {
    exchanged = await postizAdapter.exchangeOAuthCode({
      platform: params.input.platform,
      code: params.input.code,
      accountName: params.input.accountName,
      accountHandle: params.input.accountHandle,
      externalAccountId: params.input.externalAccountId,
      simulateExpiredToken: params.input.simulateExpiredToken,
    });
  } catch (err) {
    throw new ValidationError(
      err instanceof Error ? err.message : 'Failed to exchange OAuth authorization code',
    );
  }

  const encryptedAccessToken = encryptSecret(exchanged.accessToken);
  const encryptedRefreshToken = encryptSecret(exchanged.refreshToken);
  const initialStatus =
    exchanged.tokenExpiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'CONNECTED';

  const account = await prisma.socialAccount.upsert({
    where: {
      workspaceId_platform_externalAccountId: {
        workspaceId: params.workspaceId,
        platform: params.input.platform,
        externalAccountId: exchanged.externalAccountId,
      },
    },
    update: {
      accountName: exchanged.accountName,
      accountHandle: exchanged.accountHandle,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt: exchanged.tokenExpiresAt,
      scopes: exchanged.scopes,
      status: initialStatus,
      connectionError: initialStatus === 'EXPIRED' ? 'OAuth token expired' : null,
      lastHealthCheckAt: new Date(),
    },
    create: {
      workspaceId: params.workspaceId,
      platform: params.input.platform,
      accountName: exchanged.accountName,
      accountHandle: exchanged.accountHandle,
      externalAccountId: exchanged.externalAccountId,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt: exchanged.tokenExpiresAt,
      scopes: exchanged.scopes,
      status: initialStatus,
      connectionError: initialStatus === 'EXPIRED' ? 'OAuth token expired' : null,
      lastHealthCheckAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'SOCIAL_ACCOUNT_CONNECTED',
      entityType: 'SocialAccount',
      entityId: account.id,
      detailsJson: {
        platform: account.platform,
        accountHandle: account.accountHandle,
        scopes: account.scopes,
        isSimulated: exchanged.isSimulated,
      },
    },
  });

  return {
    account: sanitizeSocialAccount(account),
    isSimulated: exchanged.isSimulated,
  };
}

export async function refreshSocialAccountTokens(params: {
  workspaceId: string;
  accountId: string;
  userId?: string | undefined;
}): Promise<{
  account: SanitizedSocialAccount;
  decryptedAccessToken: string;
  isSimulated: boolean;
}> {
  const account = await prisma.socialAccount.findFirst({
    where: { id: params.accountId, workspaceId: params.workspaceId },
  });
  if (!account) {
    throw new NotFoundError('SocialAccount', params.accountId);
  }
  if (!account.encryptedRefreshToken) {
    throw new ValidationError('Social account does not have a refresh token stored');
  }

  const refreshToken = decryptSecret(account.encryptedRefreshToken);
  try {
    const refreshed = await postizAdapter.refreshAccessToken({
      platform: account.platform,
      refreshToken,
    });

    const updated = await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        encryptedAccessToken: encryptSecret(refreshed.accessToken),
        encryptedRefreshToken: encryptSecret(refreshed.refreshToken),
        tokenExpiresAt: refreshed.tokenExpiresAt,
        status: 'CONNECTED',
        connectionError: null,
        lastHealthCheckAt: new Date(),
      },
    });

    if (params.userId) {
      await prisma.auditLog.create({
        data: {
          workspaceId: params.workspaceId,
          userId: params.userId,
          action: 'SOCIAL_ACCOUNT_TOKEN_REFRESHED',
          entityType: 'SocialAccount',
          entityId: account.id,
          detailsJson: {
            platform: account.platform,
            tokenExpiresAt: refreshed.tokenExpiresAt.toISOString(),
          },
        },
      });
    }

    return {
      account: sanitizeSocialAccount(updated),
      decryptedAccessToken: refreshed.accessToken,
      isSimulated: refreshed.isSimulated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth token refresh failed';
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        status: 'REVOKED',
        connectionError: message,
        lastHealthCheckAt: new Date(),
      },
    });
    throw new ValidationError(message);
  }
}

export async function checkSocialAccountConnectionHealth(params: {
  workspaceId: string;
  accountId: string;
}) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: params.accountId, workspaceId: params.workspaceId },
  });
  if (!account) {
    throw new NotFoundError('SocialAccount', params.accountId);
  }

  const accessToken = decryptSecret(account.encryptedAccessToken);
  const currentStatus: SocialConnectionStatus =
    account.status === 'EXPIRED' || account.status === 'REVOKED' || account.status === 'ERROR'
      ? account.status
      : 'CONNECTED';

  const health = await postizAdapter.checkAccountHealth({
    platform: account.platform,
    accessToken,
    tokenExpiresAt: account.tokenExpiresAt,
    scopes: account.scopes,
    currentStatus,
  });

  const updated = await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      status: health.status,
      connectionError: health.healthy ? null : health.message,
      lastHealthCheckAt: new Date(),
    },
  });

  return {
    account: sanitizeSocialAccount(updated),
    health,
  };
}

/**
 * Creates, validates, and either schedules or immediately executes a social media post.
 * Enforces the Human Approval Gate, platform capability rules, and SHA-256 idempotency.
 */
export async function createOrSchedulePublishPost(params: {
  workspaceId: string;
  userId: string;
  input: CreatePublishPostRequest;
  storage?: MinioStorageAdapter | undefined;
}) {
  const { workspaceId, userId, input } = params;

  if (!isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(`Invalid IANA timezone identifier: ${input.timezone}`);
  }

  const socialAccount = await prisma.socialAccount.findFirst({
    where: { id: input.socialAccountId, workspaceId },
  });
  if (!socialAccount) {
    throw new NotFoundError('SocialAccount', input.socialAccountId);
  }
  if (socialAccount.status === 'REVOKED') {
    throw new ValidationError(
      `Social account ${socialAccount.accountHandle} is REVOKED. Please reconnect OAuth before publishing.`,
    );
  }

  const idempotencyKey =
    input.idempotencyKey ??
    computePublishIdempotencyKey({
      workspaceId,
      socialAccountId: socialAccount.id,
      contentType: input.contentType,
      captionText: input.captionText,
      renderJobId: input.renderJobId,
      compositionId: input.compositionId,
      assetId: input.assetId,
      scheduledFor: input.scheduledFor,
    });

  const existingByKey = await prisma.publishPost.findUnique({
    where: { idempotencyKey },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  if (existingByKey && existingByKey.workspaceId === workspaceId) {
    return {
      post: formatPublishPostResponse(existingByKey),
      deduplicated: true,
    };
  }

  let resolvedAspectRatio: AspectRatio | undefined = input.mediaAspectRatio;
  let resolvedDurationSec: number | undefined = input.mediaDurationSec;
  let hasMediaAttachment = Boolean(input.renderJobId || input.compositionId || input.assetId);
  let resolvedWorkflowId = input.workflowId ?? null;
  let resolvedRenderJobId = input.renderJobId ?? null;
  const resolvedCompositionId = input.compositionId ?? null;
  const resolvedAssetId = input.assetId ?? null;
  let isHumanApproved = false;

  if (resolvedCompositionId) {
    const comp = await prisma.composition.findFirst({
      where: { id: resolvedCompositionId, workspaceId },
    });
    if (!comp) {
      throw new NotFoundError('Composition', resolvedCompositionId);
    }

    hasMediaAttachment = true;
    if (!resolvedWorkflowId && comp.workflowId) {
      resolvedWorkflowId = comp.workflowId;
    }

    if (!resolvedRenderJobId) {
      const latestCompletedRender = await prisma.renderJob.findFirst({
        where: { compositionId: comp.id, workspaceId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      if (latestCompletedRender) {
        resolvedRenderJobId = latestCompletedRender.id;
      }
    }

    if (!resolvedAspectRatio) {
      resolvedAspectRatio = comp.aspectRatio ?? inferAspectRatioFromDimensions(comp.width, comp.height);
    }
    if (!resolvedDurationSec && comp.durationInFrames > 0 && comp.fps > 0) {
      resolvedDurationSec = Math.round(comp.durationInFrames / comp.fps);
    }

    if (comp.approvalStatus === 'APPROVED' && comp.approvedByUserId) {
      isHumanApproved = true;
    } else if (input.explicitApprovalConfirmed) {
      isHumanApproved = true;
    }
  }

  if (resolvedWorkflowId && !isHumanApproved) {
    const wf = await prisma.workflow.findFirst({
      where: { id: resolvedWorkflowId, workspaceId },
    });
    if (!wf) {
      throw new NotFoundError('Workflow', resolvedWorkflowId);
    }
    if (
      (wf.stage === 'APPROVED' || wf.stage === 'SCHEDULED' || wf.stage === 'PUBLISHED') &&
      wf.approvedByUserId
    ) {
      isHumanApproved = true;
    } else if (input.explicitApprovalConfirmed) {
      isHumanApproved = true;
    }
  }

  if (resolvedRenderJobId) {
    const rj = await prisma.renderJob.findFirst({
      where: { id: resolvedRenderJobId, workspaceId },
    });
    if (!rj) {
      throw new NotFoundError('RenderJob', resolvedRenderJobId);
    }
    hasMediaAttachment = true;
  }

  if (resolvedAssetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: resolvedAssetId, workspaceId },
    });
    if (!asset) {
      throw new NotFoundError('Asset', resolvedAssetId);
    }
    hasMediaAttachment = true;
    if (!resolvedAspectRatio) {
      resolvedAspectRatio = inferAspectRatioFromDimensions(asset.width, asset.height);
    }
    if (!resolvedDurationSec && typeof asset.durationSec === 'number') {
      resolvedDurationSec = Math.round(asset.durationSec);
    }
  }

  // Enforce Human Approval Gate strictly
  if (!isHumanApproved && !input.explicitApprovalConfirmed) {
    throw new ForbiddenError(
      'Human Approval Gate: Content must be explicitly approved before scheduling or publishing to social platforms.',
    );
  }

  // Platform-specific capability and media validation
  const cleanHashtags = input.hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean);
  const validation = validatePostForPlatform({
    platform: socialAccount.platform,
    contentType: input.contentType,
    title: input.title,
    captionText: input.captionText,
    hashtags: cleanHashtags,
    hasMediaAttachment,
    mediaAspectRatio: resolvedAspectRatio,
    mediaDurationSec: resolvedDurationSec,
  });

  if (!validation.valid) {
    throw new ValidationError(validation.errors.join('; '), {
      platform: socialAccount.platform,
      errors: validation.errors,
    });
  }

  // Persist explicit human approval on linked Composition / Workflow only after validation passes
  if (input.explicitApprovalConfirmed && resolvedCompositionId) {
    await prisma.composition
      .update({
        where: { id: resolvedCompositionId },
        data: {
          approvalStatus: 'APPROVED',
          approvedByUserId: userId,
          approvedAt: new Date(),
        },
      })
      .catch(() => null);
  }
  if (input.explicitApprovalConfirmed && resolvedWorkflowId) {
    await prisma.workflow
      .update({
        where: { id: resolvedWorkflowId },
        data: {
          stage: 'APPROVED',
          approvedByUserId: userId,
          approvedAt: new Date(),
        },
      })
      .catch(() => null);
  }

  const scheduledDate = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const shouldSchedule = Boolean(
    scheduledDate && !input.publishImmediately && scheduledDate.getTime() > Date.now(),
  );

  const created = await prisma.publishPost.create({
    data: {
      workspaceId,
      workflowId: resolvedWorkflowId,
      renderJobId: resolvedRenderJobId,
      compositionId: resolvedCompositionId,
      assetId: resolvedAssetId,
      socialAccountId: socialAccount.id,
      platform: socialAccount.platform,
      contentType: input.contentType,
      title: input.title ?? null,
      captionText: input.captionText,
      hashtags: cleanHashtags,
      status: shouldSchedule ? 'SCHEDULED' : 'APPROVED',
      providerStatus: 'PENDING',
      scheduledFor: scheduledDate,
      timezone: input.timezone,
      approvedByUserId: userId,
      approvedAt: new Date(),
      idempotencyKey,
      isSimulated: !postizAdapter.isLiveConfigured(),
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: shouldSchedule ? 'PUBLISH_POST_SCHEDULED' : 'PUBLISH_POST_CREATED',
      entityType: 'PublishPost',
      entityId: created.id,
      detailsJson: {
        platform: created.platform,
        contentType: created.contentType,
        scheduledFor: created.scheduledFor?.toISOString() ?? null,
        timezone: created.timezone,
        idempotencyKey: created.idempotencyKey,
      },
    },
  });

  if (shouldSchedule && scheduledDate) {
    if (resolvedWorkflowId) {
      await prisma.workflow
        .update({
          where: { id: resolvedWorkflowId },
          data: { stage: 'SCHEDULED' },
        })
        .catch(() => null);
    }

    const delayMs = Math.max(0, scheduledDate.getTime() - Date.now());
    await enqueuePublishingJob(
      {
        workspaceId,
        publishPostId: created.id,
        socialAccountId: socialAccount.id,
        platform: socialAccount.platform,
        idempotencyKey: created.idempotencyKey,
        scheduledFor: scheduledDate.toISOString(),
        attemptNumber: 1,
      },
      delayMs,
    );

    return {
      post: formatPublishPostResponse(created),
      deduplicated: false,
    };
  }

  const executed = await executePostPublication({
    workspaceId,
    publishPostId: created.id,
    userId,
    storage: params.storage,
  });

  return {
    post: executed,
    deduplicated: false,
  };
}

/**
 * Executes the actual provider publication attempt for an approved/scheduled PublishPost.
 * Enforces idempotency, token auto-refresh, provider confirmation verification,
 * error classification, exponential backoff retries, and dead-letter handling.
 */
export async function executePostPublication(params: {
  workspaceId: string;
  publishPostId: string;
  userId?: string | undefined;
  storage?: MinioStorageAdapter | undefined;
}) {
  const post = await prisma.publishPost.findFirst({
    where: { id: params.publishPostId, workspaceId: params.workspaceId },
    include: {
      socialAccount: true,
      renderJob: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  if (!post) {
    throw new NotFoundError('PublishPost', params.publishPostId);
  }

  // Idempotency guard: never duplicate-publish a post already confirmed PUBLISHED
  if (post.status === 'PUBLISHED' && post.providerStatus === 'PUBLISHED' && post.externalPostId) {
    return formatPublishPostResponse(post);
  }

  if (post.status === 'CANCELLED') {
    throw new ValidationError('Cannot publish a CANCELLED post');
  }

  await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      status: 'PUBLISHING',
      providerStatus: 'ACCEPTED',
    },
  });

  let accessToken: string;
  const account = post.socialAccount;
  const isExpired = Boolean(
    account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now(),
  );

  if (isExpired && account.encryptedRefreshToken) {
    try {
      const refreshed = await refreshSocialAccountTokens({
        workspaceId: params.workspaceId,
        accountId: account.id,
        userId: params.userId,
      });
      accessToken = refreshed.decryptedAccessToken;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'OAuth refresh failed during publish';
      const attemptNum = post.attempts.length + 1;
      await prisma.publishAttempt.create({
        data: {
          publishPostId: post.id,
          attemptNumber: attemptNum,
          idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNum}`,
          status: 'FAILED',
          errorCategory: 'AUTH_REVOKED',
          errorMessage: errMsg,
          isSimulated: !postizAdapter.isLiveConfigured(),
          responseJson: { error: errMsg, httpStatus: 401 },
        },
      });
      const failedPost = await prisma.publishPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          providerStatus: 'DEAD_LETTER',
          errorMessage: errMsg,
          retryCount: post.retryCount + 1,
          nextRetryAt: null,
        },
        include: {
          socialAccount: true,
          attempts: { orderBy: { attemptNumber: 'desc' } },
        },
      });
      return formatPublishPostResponse(failedPost);
    }
  } else {
    accessToken = decryptSecret(account.encryptedAccessToken);
  }

  // Resolve presigned media URL if renderJob or asset is linked
  let mediaUrl: string | undefined;
  const storageAdapter = params.storage ?? new MinioStorageAdapter();
  if (post.renderJob?.outputStorageKey) {
    mediaUrl = storageAdapter.createPresignedUrl({
      method: 'GET',
      bucket: storageAdapter.getConfig().rendersBucket,
      storageKey: post.renderJob.outputStorageKey,
      expiresInSec: 3600,
    });
  } else if (post.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: post.assetId, workspaceId: params.workspaceId },
    });
    if (asset?.storageKey) {
      mediaUrl = storageAdapter.createPresignedUrl({
        method: 'GET',
        bucket: storageAdapter.getConfig().rawBucket,
        storageKey: asset.storageKey,
        expiresInSec: 3600,
      });
    }
  }

  const attemptNumber = post.attempts.length + 1;
  const publishResult = await postizAdapter.publishPost({
    postId: post.id,
    platform: post.platform,
    contentType: (post.contentType as PublishContentType) || 'VIDEO',
    title: post.title ?? undefined,
    captionText: post.captionText,
    hashtags: post.hashtags,
    mediaUrl,
    accessToken,
    idempotencyKey: post.idempotencyKey,
    scheduledFor: post.scheduledFor ?? undefined,
  });

  await prisma.publishAttempt.create({
    data: {
      publishPostId: post.id,
      attemptNumber,
      idempotencyKey: `${post.idempotencyKey}:attempt:${attemptNumber}`,
      status: publishResult.success ? publishResult.providerStatus : 'FAILED',
      responseJson: {
        ...publishResult.rawResponse,
        httpStatus: publishResult.httpStatus,
      } as Prisma.InputJsonValue,
      errorMessage: publishResult.errorMessage ?? null,
      errorCategory: publishResult.errorCategory ?? null,
      isSimulated: publishResult.isSimulated,
    },
  });

  // Case A: Provider confirmed final publication
  if (publishResult.success && publishResult.providerStatus === 'PUBLISHED') {
    const published = await prisma.publishPost.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        providerStatus: 'PUBLISHED',
        publishedAt: new Date(),
        externalPostId: publishResult.externalPostId ?? null,
        externalPostUrl: publishResult.externalPostUrl ?? null,
        errorMessage: null,
        nextRetryAt: null,
        isSimulated: publishResult.isSimulated,
      },
      include: {
        socialAccount: true,
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
    });

    if (post.workflowId) {
      await prisma.workflow
        .update({
          where: { id: post.workflowId },
          data: { stage: 'PUBLISHED', completedAt: new Date() },
        })
        .catch(() => null);
    }

    if (params.userId) {
      await prisma.auditLog.create({
        data: {
          workspaceId: params.workspaceId,
          userId: params.userId,
          action: 'PUBLISH_POST_CONFIRMED',
          entityType: 'PublishPost',
          entityId: post.id,
          detailsJson: {
            platform: post.platform,
            externalPostId: published.externalPostId,
            externalPostUrl: published.externalPostUrl,
            isSimulated: published.isSimulated,
          },
        },
      });
    }

    return formatPublishPostResponse(published);
  }

  // Case B: Provider accepted into async processing queue (NOT yet confirmed PUBLISHED)
  if (
    publishResult.success &&
    (publishResult.providerStatus === 'PROCESSING' || publishResult.providerStatus === 'ACCEPTED')
  ) {
    const processingPost = await prisma.publishPost.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHING',
        providerStatus: publishResult.providerStatus,
        externalPostId: publishResult.externalPostId ?? null,
        errorMessage: null,
        isSimulated: publishResult.isSimulated,
      },
      include: {
        socialAccount: true,
        attempts: { orderBy: { attemptNumber: 'desc' } },
      },
    });

    return formatPublishPostResponse(processingPost);
  }

  // Case C: Publication failed — classify error, compute backoff or dead-letter
  const newRetryCount = post.retryCount + 1;
  if (publishResult.errorCategory === 'AUTH_REVOKED') {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        status: 'REVOKED',
        connectionError: publishResult.errorMessage ?? 'OAuth credentials revoked',
        lastHealthCheckAt: new Date(),
      },
    });
  }

  const canRetry = publishResult.retryable && newRetryCount < post.maxRetries;
  const backoffMs = canRetry
    ? publishResult.retryAfterMs ?? calculatePublishRetryBackoffMs(newRetryCount, 5_000)
    : 0;
  const nextRetryAt = canRetry ? new Date(Date.now() + backoffMs) : null;
  const providerStatus = canRetry ? 'FAILED' : 'DEAD_LETTER';

  const failed = await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      status: 'FAILED',
      providerStatus,
      errorMessage: publishResult.errorMessage ?? 'Provider rejected publication attempt',
      retryCount: newRetryCount,
      nextRetryAt,
      isSimulated: publishResult.isSimulated,
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  if (canRetry && nextRetryAt) {
    await enqueuePublishingJob(
      {
        workspaceId: params.workspaceId,
        publishPostId: post.id,
        socialAccountId: account.id,
        platform: post.platform,
        idempotencyKey: post.idempotencyKey,
        attemptNumber: newRetryCount + 1,
      },
      backoffMs,
    );
  }

  return formatPublishPostResponse(failed);
}

export async function reschedulePublishPost(params: {
  workspaceId: string;
  publishPostId: string;
  userId: string;
  input: ReschedulePublishPostInput;
}) {
  if (!isValidIanaTimezone(params.input.timezone)) {
    throw new ValidationError(`Invalid IANA timezone: ${params.input.timezone}`);
  }

  const post = await prisma.publishPost.findFirst({
    where: { id: params.publishPostId, workspaceId: params.workspaceId },
    include: { socialAccount: true },
  });
  if (!post) {
    throw new NotFoundError('PublishPost', params.publishPostId);
  }
  if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
    throw new ValidationError(`Cannot reschedule a post with status ${post.status}`);
  }

  const newScheduledFor = new Date(params.input.scheduledFor);
  await cancelScheduledPublishingJob(post.idempotencyKey);

  const updated = await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      scheduledFor: newScheduledFor,
      timezone: params.input.timezone,
      status: 'SCHEDULED',
      providerStatus: 'PENDING',
      errorMessage: null,
      nextRetryAt: null,
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  const delayMs = Math.max(0, newScheduledFor.getTime() - Date.now());
  await enqueuePublishingJob(
    {
      workspaceId: params.workspaceId,
      publishPostId: updated.id,
      socialAccountId: updated.socialAccountId,
      platform: updated.platform,
      idempotencyKey: updated.idempotencyKey,
      scheduledFor: newScheduledFor.toISOString(),
    },
    delayMs,
  );

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'PUBLISH_POST_RESCHEDULED',
      entityType: 'PublishPost',
      entityId: updated.id,
      detailsJson: {
        previousScheduledFor: post.scheduledFor?.toISOString() ?? null,
        newScheduledFor: newScheduledFor.toISOString(),
        timezone: params.input.timezone,
      },
    },
  });

  return formatPublishPostResponse(updated);
}

export async function updatePublishPostContent(params: {
  workspaceId: string;
  publishPostId: string;
  userId: string;
  input: UpdatePublishPostInput;
}) {
  const post = await prisma.publishPost.findFirst({
    where: { id: params.publishPostId, workspaceId: params.workspaceId },
    include: { socialAccount: true },
  });
  if (!post) {
    throw new NotFoundError('PublishPost', params.publishPostId);
  }
  if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
    throw new ValidationError(`Cannot edit content of a post with status ${post.status}`);
  }

  const nextTitle = params.input.title !== undefined ? params.input.title : post.title;
  const nextCaption =
    params.input.captionText !== undefined ? params.input.captionText : post.captionText;
  const nextHashtags =
    params.input.hashtags !== undefined
      ? params.input.hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean)
      : post.hashtags;

  const hasMedia = Boolean(post.renderJobId || post.compositionId || post.assetId);
  const validation = validatePostForPlatform({
    platform: post.platform,
    contentType: (post.contentType as PublishContentType) || 'VIDEO',
    title: nextTitle,
    captionText: nextCaption,
    hashtags: nextHashtags,
    hasMediaAttachment: hasMedia,
  });

  if (!validation.valid) {
    throw new ValidationError(validation.errors.join('; '), {
      platform: post.platform,
      errors: validation.errors,
    });
  }

  const updated = await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      title: nextTitle,
      captionText: nextCaption,
      hashtags: nextHashtags,
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'PUBLISH_POST_UPDATED',
      entityType: 'PublishPost',
      entityId: updated.id,
      detailsJson: {
        platform: updated.platform,
      },
    },
  });

  return formatPublishPostResponse(updated);
}

export async function cancelPublishPost(params: {
  workspaceId: string;
  publishPostId: string;
  userId: string;
}) {
  const post = await prisma.publishPost.findFirst({
    where: { id: params.publishPostId, workspaceId: params.workspaceId },
  });
  if (!post) {
    throw new NotFoundError('PublishPost', params.publishPostId);
  }
  if (post.status === 'PUBLISHED') {
    throw new ValidationError('Cannot cancel a post that has already been published');
  }

  await cancelScheduledPublishingJob(post.idempotencyKey);

  const cancelled = await prisma.publishPost.update({
    where: { id: post.id },
    data: {
      status: 'CANCELLED',
      nextRetryAt: null,
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'PUBLISH_POST_CANCELLED',
      entityType: 'PublishPost',
      entityId: cancelled.id,
      detailsJson: {
        previousStatus: post.status,
      },
    },
  });

  return formatPublishPostResponse(cancelled);
}

export async function getCalendarEntries(params: {
  workspaceId: string;
  query: CalendarQuery;
}) {
  const timezone = isValidIanaTimezone(params.query.timezone) ? params.query.timezone : 'UTC';
  const anchor = params.query.anchorDate ? new Date(params.query.anchorDate) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    throw new ValidationError('Invalid anchorDate parameter');
  }

  let windowStart: Date;
  let windowEnd: Date;

  if (params.query.view === 'day') {
    windowStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 0, 0, 0) -
        14 * 3600 * 1000,
    );
    windowEnd = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 23, 59, 59) +
        14 * 3600 * 1000,
    );
  } else if (params.query.view === 'week') {
    const dayOfWeek = anchor.getUTCDay();
    const startDay = anchor.getUTCDate() - dayOfWeek;
    windowStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), startDay, 0, 0, 0) -
        14 * 3600 * 1000,
    );
    windowEnd = new Date(windowStart.getTime() + 9 * 24 * 3600 * 1000);
  } else {
    windowStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 0, 0, 0) -
        7 * 24 * 3600 * 1000,
    );
    windowEnd = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 23, 59, 59) +
        7 * 24 * 3600 * 1000,
    );
  }

  const posts = await prisma.publishPost.findMany({
    where: {
      workspaceId: params.workspaceId,
      ...(params.query.platform ? { platform: params.query.platform } : {}),
      ...(params.query.socialAccountId ? { socialAccountId: params.query.socialAccountId } : {}),
      ...(params.query.status ? { status: params.query.status } : {}),
      OR: [
        {
          scheduledFor: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        {
          publishedAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        {
          scheduledFor: null,
          createdAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      ],
    },
    include: {
      socialAccount: true,
      attempts: { orderBy: { attemptNumber: 'desc' }, take: 3 },
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
  });

  const daysMap: Record<string, ReturnType<typeof formatPublishPostResponse>[]> = {};
  const entries = posts.map((post) => {
    const effectiveDate = post.scheduledFor ?? post.publishedAt ?? post.createdAt;
    const localFormatted = formatDateInTimezone(effectiveDate, timezone);
    const localDateKey = localFormatted.slice(0, 10);
    const formatted = {
      ...formatPublishPostResponse(post),
      calendarDateKey: localDateKey,
      localDateTimeLabel: localFormatted,
      displayTimezone: timezone,
    };
    if (!daysMap[localDateKey]) {
      daysMap[localDateKey] = [];
    }
    daysMap[localDateKey].push(formatted);
    return formatted;
  });

  return {
    view: params.query.view,
    anchorDate: anchor.toISOString(),
    timezone,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalCount: entries.length,
    entries,
    groupedByDate: daysMap,
  };
}

export function formatPublishPostResponse(
  post: Prisma.PublishPostGetPayload<{
    include: {
      socialAccount: true;
      attempts: true;
    };
  }>,
) {
  const effectiveDate = post.scheduledFor ?? post.publishedAt ?? post.createdAt;
  const tz = isValidIanaTimezone(post.timezone) ? post.timezone : 'UTC';
  return {
    id: post.id,
    workspaceId: post.workspaceId,
    workflowId: post.workflowId,
    renderJobId: post.renderJobId,
    compositionId: post.compositionId,
    assetId: post.assetId,
    socialAccountId: post.socialAccountId,
    socialAccount: sanitizeSocialAccount(post.socialAccount),
    platform: post.platform,
    contentType: post.contentType,
    title: post.title,
    captionText: post.captionText,
    hashtags: post.hashtags,
    status: post.status,
    providerStatus: post.providerStatus,
    scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString() : null,
    timezone: tz,
    localScheduledLabel: post.scheduledFor ? formatDateInTimezone(post.scheduledFor, tz) : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    localEffectiveLabel: formatDateInTimezone(effectiveDate, tz),
    externalPostId: post.externalPostId,
    externalPostUrl: post.externalPostUrl,
    idempotencyKey: post.idempotencyKey,
    errorMessage: post.errorMessage,
    isSimulated: post.isSimulated,
    retryCount: post.retryCount,
    maxRetries: post.maxRetries,
    nextRetryAt: post.nextRetryAt ? post.nextRetryAt.toISOString() : null,
    approvedByUserId: post.approvedByUserId,
    approvedAt: post.approvedAt ? post.approvedAt.toISOString() : null,
    attempts: post.attempts.map((a) => {
      const respObj =
        a.responseJson && typeof a.responseJson === 'object'
          ? (a.responseJson as Record<string, unknown>)
          : {};
      return {
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,
        httpStatus: typeof respObj['httpStatus'] === 'number' ? respObj['httpStatus'] : null,
        errorCategory: a.errorCategory,
        errorMessage: a.errorMessage,
        isSimulated: a.isSimulated,
        attemptedAt: a.attemptedAt.toISOString(),
      };
    }),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
