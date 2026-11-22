import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AspectRatio, AspectRatioSchema, TargetPlatform, TargetPlatformSchema } from './workflow.js';

// -----------------------------------------------------------------------------
// 1. Platform-Specific Publishing Capabilities & Constraints Matrix
// -----------------------------------------------------------------------------

export const PublishContentTypeSchema = z.enum(['VIDEO', 'IMAGE', 'WRITTEN']);
export type PublishContentType = z.infer<typeof PublishContentTypeSchema>;

export const PublishProviderStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTER',
]);
export type PublishProviderStatus = z.infer<typeof PublishProviderStatusSchema>;

export const PublishErrorCategorySchema = z.enum([
  'RATE_LIMIT',
  'AUTH_REVOKED',
  'VALIDATION',
  'TRANSIENT_NETWORK',
  'PROVIDER_REJECTED',
]);
export type PublishErrorCategory = z.infer<typeof PublishErrorCategorySchema>;

export const SocialConnectionStatusSchema = z.enum(['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR']);
export type SocialConnectionStatus = z.infer<typeof SocialConnectionStatusSchema>;

export interface PlatformCapabilitySpec {
  platform: TargetPlatform;
  displayName: string;
  supportedContentTypes: readonly PublishContentType[];
  allowedAspectRatios: readonly AspectRatio[];
  maxCaptionLength: number;
  maxTitleLength?: number;
  maxHashtags: number;
  maxVideoDurationSec: number;
  requiresTitle: boolean;
  requiresMedia: boolean;
  requiredOAuthScopes: readonly string[];
}

export const PLATFORM_PUBLISHING_CAPABILITIES: Record<TargetPlatform, PlatformCapabilitySpec> = {
  INSTAGRAM_REELS: {
    platform: 'INSTAGRAM_REELS',
    displayName: 'Instagram Reels & Feed',
    supportedContentTypes: ['VIDEO', 'IMAGE'],
    allowedAspectRatios: ['PORTRAIT_9_16', 'SQUARE_1_1', 'PORTRAIT_4_5'],
    maxCaptionLength: 2200,
    maxHashtags: 30,
    maxVideoDurationSec: 90,
    requiresTitle: false,
    requiresMedia: true,
    requiredOAuthScopes: ['instagram_basic', 'instagram_content_publish'],
  },
  TIKTOK: {
    platform: 'TIKTOK',
    displayName: 'TikTok Short-Form Video',
    supportedContentTypes: ['VIDEO'],
    allowedAspectRatios: ['PORTRAIT_9_16'],
    maxCaptionLength: 2200,
    maxHashtags: 20,
    maxVideoDurationSec: 600,
    requiresTitle: false,
    requiresMedia: true,
    requiredOAuthScopes: ['user.info.basic', 'video.upload', 'video.publish'],
  },
  YOUTUBE_SHORTS: {
    platform: 'YOUTUBE_SHORTS',
    displayName: 'YouTube Shorts',
    supportedContentTypes: ['VIDEO'],
    allowedAspectRatios: ['PORTRAIT_9_16', 'SQUARE_1_1'],
    maxCaptionLength: 5000,
    maxTitleLength: 100,
    maxHashtags: 15,
    maxVideoDurationSec: 60,
    requiresTitle: true,
    requiresMedia: true,
    requiredOAuthScopes: ['https://www.googleapis.com/auth/youtube.upload'],
  },
  YOUTUBE_LONG: {
    platform: 'YOUTUBE_LONG',
    displayName: 'YouTube Long-Form Video',
    supportedContentTypes: ['VIDEO'],
    allowedAspectRatios: ['LANDSCAPE_16_9'],
    maxCaptionLength: 5000,
    maxTitleLength: 100,
    maxHashtags: 15,
    maxVideoDurationSec: 43200,
    requiresTitle: true,
    requiresMedia: true,
    requiredOAuthScopes: ['https://www.googleapis.com/auth/youtube.upload'],
  },
  LINKEDIN: {
    platform: 'LINKEDIN',
    displayName: 'LinkedIn Feed & Video',
    supportedContentTypes: ['VIDEO', 'IMAGE', 'WRITTEN'],
    allowedAspectRatios: ['PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE_1_1', 'PORTRAIT_4_5'],
    maxCaptionLength: 3000,
    maxHashtags: 30,
    maxVideoDurationSec: 600,
    requiresTitle: false,
    requiresMedia: false,
    requiredOAuthScopes: ['r_liteprofile', 'w_member_social'],
  },
  X_TWITTER: {
    platform: 'X_TWITTER',
    displayName: 'X (Twitter)',
    supportedContentTypes: ['VIDEO', 'IMAGE', 'WRITTEN'],
    allowedAspectRatios: ['PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE_1_1'],
    maxCaptionLength: 280,
    maxHashtags: 10,
    maxVideoDurationSec: 140,
    requiresTitle: false,
    requiresMedia: false,
    requiredOAuthScopes: ['tweet.read', 'tweet.write', 'users.read'],
  },
  FACEBOOK: {
    platform: 'FACEBOOK',
    displayName: 'Facebook Page & Reels',
    supportedContentTypes: ['VIDEO', 'IMAGE', 'WRITTEN'],
    allowedAspectRatios: ['PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE_1_1', 'PORTRAIT_4_5'],
    maxCaptionLength: 63206,
    maxHashtags: 30,
    maxVideoDurationSec: 14400,
    requiresTitle: false,
    requiresMedia: false,
    requiredOAuthScopes: ['pages_manage_posts', 'pages_read_engagement'],
  },
};

export interface PostValidationInput {
  platform: TargetPlatform;
  contentType: PublishContentType;
  title?: string | null | undefined;
  captionText: string;
  hashtags: readonly string[];
  hasMediaAttachment: boolean;
  mediaAspectRatio?: AspectRatio | null | undefined;
  mediaDurationSec?: number | null | undefined;
}

export interface PostValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a post's content type, media attachment, aspect ratio, duration,
 * title, caption length, and hashtags against the target platform's capabilities.
 */
export function validatePostForPlatform(input: PostValidationInput): PostValidationResult {
  const cap = PLATFORM_PUBLISHING_CAPABILITIES[input.platform];
  const errors: string[] = [];

  if (!cap.supportedContentTypes.includes(input.contentType)) {
    errors.push(
      `${cap.displayName} does not support ${input.contentType} posts (allowed: ${cap.supportedContentTypes.join(', ')})`,
    );
  }

  if (cap.requiresMedia && !input.hasMediaAttachment) {
    errors.push(`${cap.displayName} requires an attached video or image media artifact`);
  }

  if (cap.requiresTitle) {
    const cleanTitle = input.title?.trim() ?? '';
    if (!cleanTitle) {
      errors.push(`${cap.displayName} requires a video title`);
    } else if (cap.maxTitleLength && cleanTitle.length > cap.maxTitleLength) {
      errors.push(
        `Title length (${cleanTitle.length}) exceeds ${cap.displayName} limit of ${cap.maxTitleLength} characters`,
      );
    }
  }

  if (input.captionText.length > cap.maxCaptionLength) {
    errors.push(
      `Caption length (${input.captionText.length}) exceeds ${cap.displayName} maximum of ${cap.maxCaptionLength} characters`,
    );
  }

  if (input.hashtags.length > cap.maxHashtags) {
    errors.push(
      `Hashtag count (${input.hashtags.length}) exceeds ${cap.displayName} maximum of ${cap.maxHashtags} hashtags`,
    );
  }

  if (
    input.mediaAspectRatio &&
    !cap.allowedAspectRatios.includes(input.mediaAspectRatio)
  ) {
    errors.push(
      `Media aspect ratio ${input.mediaAspectRatio} is not supported by ${cap.displayName} (allowed: ${cap.allowedAspectRatios.join(', ')})`,
    );
  }

  if (
    input.contentType === 'VIDEO' &&
    typeof input.mediaDurationSec === 'number' &&
    input.mediaDurationSec > cap.maxVideoDurationSec
  ) {
    errors.push(
      `Video duration (${input.mediaDurationSec}s) exceeds ${cap.displayName} limit of ${cap.maxVideoDurationSec}s`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// -----------------------------------------------------------------------------
// 2. Timezone & Idempotency Helpers
// -----------------------------------------------------------------------------

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDateInTimezone(date: Date, timeZone: string): string {
  const safeTz = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function computePublishIdempotencyKey(params: {
  workspaceId: string;
  socialAccountId: string;
  contentType: PublishContentType;
  captionText: string;
  renderJobId?: string | null | undefined;
  compositionId?: string | null | undefined;
  assetId?: string | null | undefined;
  scheduledFor?: string | null | undefined;
}): string {
  const raw = [
    params.workspaceId,
    params.socialAccountId,
    params.contentType,
    params.renderJobId ?? '',
    params.compositionId ?? '',
    params.assetId ?? '',
    params.scheduledFor ?? 'IMMEDIATE',
    params.captionText.trim(),
  ].join('|');

  return `pub-${createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32)}`;
}

/**
 * Computes exponential backoff delay in milliseconds with a cap at 15 minutes.
 */
export function calculatePublishRetryBackoffMs(attemptNumber: number, baseDelayMs = 30_000): number {
  const exponent = Math.max(0, attemptNumber - 1);
  return Math.min(15 * 60 * 1000, baseDelayMs * Math.pow(2, exponent));
}

// -----------------------------------------------------------------------------
// 3. Phase 4 API Request & Response Schemas
// -----------------------------------------------------------------------------

export const InitiateOAuthConnectSchema = z.object({
  platform: TargetPlatformSchema,
  redirectUri: z.string().url().optional(),
});
export type InitiateOAuthConnectInput = z.infer<typeof InitiateOAuthConnectSchema>;

export const CompleteOAuthConnectSchema = z.object({
  platform: TargetPlatformSchema,
  code: z.string().trim().min(2).max(512),
  state: z.string().trim().optional(),
  accountName: z.string().trim().min(2).max(120),
  accountHandle: z.string().trim().min(2).max(120),
  externalAccountId: z.string().trim().min(2).max(160).optional(),
  simulateExpiredToken: z.boolean().optional(),
});
export type CompleteOAuthConnectInput = z.infer<typeof CompleteOAuthConnectSchema>;

export const CreatePublishPostRequestSchema = z.object({
  socialAccountId: z.string().uuid(),
  contentType: PublishContentTypeSchema.default('VIDEO'),
  compositionId: z.string().uuid().optional(),
  renderJobId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  title: z.string().trim().max(160).optional(),
  captionText: z.string().trim().min(1).max(65000),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(35).default([]),
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().trim().default('UTC'),
  publishImmediately: z.boolean().default(false),
  explicitApprovalConfirmed: z.boolean().default(false),
  requireVerifiedRights: z.boolean().default(false),
  territory: z.string().trim().min(2).max(16).default('US'),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  mediaAspectRatio: AspectRatioSchema.optional(),
  mediaDurationSec: z.number().positive().optional(),
});
export type CreatePublishPostRequest = z.infer<typeof CreatePublishPostRequestSchema>;

export const ReschedulePublishPostSchema = z.object({
  scheduledFor: z.string().datetime(),
  timezone: z.string().trim().default('UTC'),
});
export type ReschedulePublishPostInput = z.infer<typeof ReschedulePublishPostSchema>;

export const UpdatePublishPostSchema = z.object({
  title: z.string().trim().max(160).optional(),
  captionText: z.string().trim().min(1).max(65000).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(35).optional(),
});
export type UpdatePublishPostInput = z.infer<typeof UpdatePublishPostSchema>;

export const CalendarQuerySchema = z.object({
  view: z.enum(['day', 'week', 'month']).default('month'),
  anchorDate: z.string().optional(),
  platform: TargetPlatformSchema.optional(),
  socialAccountId: z.string().uuid().optional(),
  status: z
    .enum([
      'DRAFT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'SCHEDULED',
      'PUBLISHING',
      'PUBLISHED',
      'FAILED',
      'CANCELLED',
    ])
    .optional(),
  timezone: z.string().trim().default('UTC'),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
