import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 8 — Distribution, Platform Capability Registry & Analytics Intelligence
// -----------------------------------------------------------------------------

export const SocialPlatformKeySchema = z.enum([
  'INSTAGRAM_REELS',
  'FACEBOOK',
  'TIKTOK',
  'YOUTUBE_SHORTS',
  'LINKEDIN',
  'X',
]);
export type SocialPlatformKey = z.infer<typeof SocialPlatformKeySchema>;

export interface SocialPlatformCapabilitySpec {
  platform: SocialPlatformKey;
  displayName: string;
  supportedMediaTypes: readonly string[];
  supportedAspectRatios: readonly string[];
  maxDurationSec: number;
  maxFileSizeMb: number;
  maxCaptionChars: number;
  maxHashtags: number;
  supportsScheduling: boolean;
  directPublishingRequires: string;
  oauthScopes: readonly string[];
  apiRestrictions: readonly string[];
  knownLimitations: readonly string[];
}

export const SOCIAL_PLATFORM_CAPABILITIES: readonly SocialPlatformCapabilitySpec[] = [
  {
    platform: 'INSTAGRAM_REELS',
    displayName: 'Instagram Reels',
    supportedMediaTypes: ['video/mp4'],
    supportedAspectRatios: ['PORTRAIT_9_16', 'PORTRAIT_4_5'],
    maxDurationSec: 90,
    maxFileSizeMb: 300,
    maxCaptionChars: 2200,
    maxHashtags: 30,
    supportsScheduling: true,
    directPublishingRequires: 'Meta Graph API Business/Creator account + Postiz/Meta App Review',
    oauthScopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'],
    apiRestrictions: ['Personal Instagram accounts cannot publish via API; Business/Creator required.'],
    knownLimitations: ['Audio library tracks cannot be attached via Graph API; audio must be baked into MP4.'],
  },
  {
    platform: 'FACEBOOK',
    displayName: 'Facebook Pages / Reels',
    supportedMediaTypes: ['video/mp4', 'image/jpeg', 'image/png'],
    supportedAspectRatios: ['PORTRAIT_9_16', 'SQUARE_1_1', 'LANDSCAPE_16_9'],
    maxDurationSec: 90,
    maxFileSizeMb: 1024,
    maxCaptionChars: 63206,
    maxHashtags: 30,
    supportsScheduling: true,
    directPublishingRequires: 'Meta Page Access Token + pages_manage_posts approval',
    oauthScopes: ['pages_manage_posts', 'pages_read_engagement'],
    apiRestrictions: ['Publishing restricted to managed Facebook Pages, not personal profiles.'],
    knownLimitations: ['Reels insights require Page-level analytics permissions.'],
  },
  {
    platform: 'TIKTOK',
    displayName: 'TikTok',
    supportedMediaTypes: ['video/mp4'],
    supportedAspectRatios: ['PORTRAIT_9_16'],
    maxDurationSec: 180,
    maxFileSizeMb: 500,
    maxCaptionChars: 2200,
    maxHashtags: 20,
    supportsScheduling: true,
    directPublishingRequires: 'TikTok Content Posting API audit & approved OAuth client',
    oauthScopes: ['video.publish', 'video.upload', 'user.info.basic'],
    apiRestrictions: ['Unaudited TikTok apps are restricted to private/self-only drafts.'],
    knownLimitations: ['Commercial music disclosure flags must be declared by creator.'],
  },
  {
    platform: 'YOUTUBE_SHORTS',
    displayName: 'YouTube Shorts',
    supportedMediaTypes: ['video/mp4'],
    supportedAspectRatios: ['PORTRAIT_9_16', 'SQUARE_1_1'],
    maxDurationSec: 60,
    maxFileSizeMb: 2048,
    maxCaptionChars: 5000,
    maxHashtags: 15,
    supportsScheduling: true,
    directPublishingRequires: 'Google OAuth consent verification + YouTube Data API v3 quota',
    oauthScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
    apiRestrictions: ['Unverified OAuth projects have uploads locked to private visibility.'],
    knownLimitations: ['Daily upload quota governed by Google Cloud API unit allocation.'],
  },
  {
    platform: 'LINKEDIN',
    displayName: 'LinkedIn',
    supportedMediaTypes: ['video/mp4', 'image/png', 'image/jpeg'],
    supportedAspectRatios: ['PORTRAIT_4_5', 'SQUARE_1_1', 'LANDSCAPE_16_9', 'PORTRAIT_9_16'],
    maxDurationSec: 600,
    maxFileSizeMb: 500,
    maxCaptionChars: 3000,
    maxHashtags: 10,
    supportsScheduling: true,
    directPublishingRequires: 'LinkedIn Marketing Developer Platform / w_member_social OAuth',
    oauthScopes: ['w_member_social', 'r_organization_social'],
    apiRestrictions: ['Organization page posting requires Community Management API approval.'],
    knownLimitations: ['Video captions SRT upload requires separate asset registration step.'],
  },
  {
    platform: 'X',
    displayName: 'X (Twitter)',
    supportedMediaTypes: ['video/mp4', 'image/png', 'image/jpeg'],
    supportedAspectRatios: ['LANDSCAPE_16_9', 'SQUARE_1_1', 'PORTRAIT_9_16'],
    maxDurationSec: 140,
    maxFileSizeMb: 512,
    maxCaptionChars: 280,
    maxHashtags: 5,
    supportsScheduling: true,
    directPublishingRequires: 'X API Basic/Pro tier credentials + OAuth 2.0 write scope',
    oauthScopes: ['tweet.read', 'tweet.write', 'users.read'],
    apiRestrictions: ['Free API tier has strict monthly write caps; analytics requires paid tier.'],
    knownLimitations: ['Standard accounts limited to 280 characters and 140s video duration.'],
  },
];

export const ValidateDeliverableRequestSchema = z.object({
  platform: SocialPlatformKeySchema,
  compositionId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  aspectRatio: z.string().default('PORTRAIT_9_16'),
  durationSec: z.number().nonnegative().default(20),
  fileSizeMb: z.number().nonnegative().default(5),
  caption: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
});
export type ValidateDeliverableRequest = z.infer<typeof ValidateDeliverableRequestSchema>;

export const ReschedulePublishPostRequestSchema = z.object({
  scheduledFor: z.string().datetime(),
  timezone: z.string().min(2).max(64).default('UTC'),
});
export type ReschedulePublishPostRequest = z.infer<typeof ReschedulePublishPostRequestSchema>;

export const MetricProvenanceSchema = z.enum([
  'ACTUAL_PLATFORM',
  'USER_IMPORTED',
  'ESTIMATED',
  'UNAVAILABLE',
]);
export type MetricProvenance = z.infer<typeof MetricProvenanceSchema>;

export const ImportAuthorizedMetricsRequestSchema = z.object({
  platform: SocialPlatformKeySchema,
  publishPostId: z.string().uuid().optional(),
  provenance: MetricProvenanceSchema.default('USER_IMPORTED'),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  avgWatchSec: z.number().nonnegative().optional(),
  hookLabel: z.string().max(120).optional(),
  recordedAt: z.string().datetime().optional(),
});
export type ImportAuthorizedMetricsRequest = z.infer<typeof ImportAuthorizedMetricsRequestSchema>;
