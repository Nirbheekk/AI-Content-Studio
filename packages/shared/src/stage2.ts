import { z } from 'zod';

// -----------------------------------------------------------------------------
// 1. Media Rights & Publishing Rights Gate Contracts (Stage 2B & 2C)
// -----------------------------------------------------------------------------

export const MediaRightsStatusSchema = z.enum([
  'UNKNOWN',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'RESTRICTED',
  'EXPIRED',
  'REVOKED',
]);
export type MediaRightsStatus = z.infer<typeof MediaRightsStatusSchema>;

export const MediaRightsSourceSchema = z.enum([
  'USER_OWNED',
  'LICENSED_STOCK',
  'AI_GENERATED',
  'VOICE_CLONED',
  'CLIENT_PROVIDED',
  'UNKNOWN',
]);
export type MediaRightsSource = z.infer<typeof MediaRightsSourceSchema>;

export const RightsDecisionSchema = z.enum([
  'ALLOWED',
  'ALLOWED_WITH_ATTRIBUTION',
  'REVIEW_REQUIRED',
  'BLOCKED',
]);
export type RightsDecision = z.infer<typeof RightsDecisionSchema>;

export const UpsertMediaRightsRequestSchema = z.object({
  rightsOwner: z.string().trim().min(1).max(200),
  creatorName: z.string().trim().max(200).optional(),
  source: MediaRightsSourceSchema,
  licenseType: z.string().trim().min(1).max(160),
  commercialAllowed: z.boolean(),
  attributionRequired: z.boolean().default(false),
  attributionText: z.string().trim().max(400).optional(),
  territoryRestrictions: z.array(z.string().trim().min(2).max(64)).max(50).default([]),
  usageRestrictions: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
  consentStatus: z
    .enum(['NOT_REQUIRED', 'PENDING', 'VERIFIED', 'DENIED'])
    .default('NOT_REQUIRED'),
  consentDocKey: z.string().trim().max(400).optional(),
  status: MediaRightsStatusSchema.default('PENDING_VERIFICATION'),
  notes: z.string().trim().max(1000).optional(),
});
export type UpsertMediaRightsRequest = z.infer<typeof UpsertMediaRightsRequestSchema>;

export const RightsCheckAssetOutcomeSchema = z.object({
  assetId: z.string(),
  assetName: z.string(),
  decision: RightsDecisionSchema,
  status: MediaRightsStatusSchema,
  reasons: z.array(z.string()),
  attributionRequired: z.boolean(),
  attributionText: z.string().nullable(),
});
export type RightsCheckAssetOutcome = z.infer<typeof RightsCheckAssetOutcomeSchema>;

export const PublishRightsEvaluationSchema = z.object({
  decision: RightsDecisionSchema,
  allowedToPublish: z.boolean(),
  reasons: z.array(z.string()),
  requiredAttributions: z.array(z.string()),
  blockedAssetIds: z.array(z.string()),
  evaluatedAssets: z.array(RightsCheckAssetOutcomeSchema),
  evaluatedAt: z.string().datetime(),
});
export type PublishRightsEvaluation = z.infer<typeof PublishRightsEvaluationSchema>;

export const PublishRightsCheckRequestSchema = z.object({
  assetId: z.string().uuid().optional(),
  compositionId: z.string().uuid().optional(),
  renderJobId: z.string().uuid().optional(),
  platform: z.string().trim().min(1).max(64).default('INSTAGRAM_REELS'),
  territory: z.string().trim().min(2).max(16).default('US'),
  commercialUse: z.boolean().default(true),
  requireVerifiedRights: z.boolean().default(true),
});
export type PublishRightsCheckRequest = z.infer<typeof PublishRightsCheckRequestSchema>;

// -----------------------------------------------------------------------------
// 2. Centralized Provider Pricing Registry & Pre-Flight Cost Estimator (Stage 2D)
// -----------------------------------------------------------------------------

export interface ProviderPriceEntry {
  provider: string;
  model: string;
  operation:
    | 'LLM_GENERATION'
    | 'TRANSCRIPTION'
    | 'TTS'
    | 'IMAGE_GENERATION'
    | 'VIDEO_GENERATION'
    | 'RENDERING'
    | 'STORAGE';
  unit: 'per_1k_tokens' | 'per_minute' | 'per_1k_chars' | 'per_image' | 'per_second' | 'per_gb_month';
  unitPriceUsd: number;
  currency: 'USD';
  effectiveDate: string;
  lastVerifiedDate: string;
  sourceRef: string;
}

/**
 * Explicitly sourced pricing entries. Operations not listed here MUST be reported
 * as `priceStatus: 'UNKNOWN'` rather than fabricating estimates.
 */
export const PROVIDER_PRICING_REGISTRY: readonly ProviderPriceEntry[] = [
  {
    provider: 'google-gemini',
    model: 'gemini-2.5-flash',
    operation: 'LLM_GENERATION',
    unit: 'per_1k_tokens',
    unitPriceUsd: 0.00045,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-01',
    sourceRef: 'https://ai.google.dev/pricing',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    operation: 'LLM_GENERATION',
    unit: 'per_1k_tokens',
    unitPriceUsd: 0.000375,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-01',
    sourceRef: 'https://openai.com/api/pricing/',
  },
  {
    provider: 'openai',
    model: 'whisper-1',
    operation: 'TRANSCRIPTION',
    unit: 'per_minute',
    unitPriceUsd: 0.006,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-01',
    sourceRef: 'https://openai.com/api/pricing/',
  },
  {
    provider: 'elevenlabs',
    model: 'eleven_multilingual_v2',
    operation: 'TTS',
    unit: 'per_1k_chars',
    unitPriceUsd: 0.18,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-01',
    sourceRef: 'https://elevenlabs.io/pricing',
  },
  {
    provider: 'local-ffmpeg',
    model: 'libx264-aac',
    operation: 'RENDERING',
    unit: 'per_minute',
    unitPriceUsd: 0,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-22',
    sourceRef: 'local-self-hosted-container',
  },
  {
    provider: 'local-minio',
    model: 's3-object-storage',
    operation: 'STORAGE',
    unit: 'per_gb_month',
    unitPriceUsd: 0,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-22',
    sourceRef: 'local-self-hosted-minio',
  },
  {
    provider: 'simulated',
    model: 'deterministic-dev',
    operation: 'LLM_GENERATION',
    unit: 'per_1k_tokens',
    unitPriceUsd: 0,
    currency: 'USD',
    effectiveDate: '2026-01-01',
    lastVerifiedDate: '2026-11-22',
    sourceRef: 'local-dev-simulation',
  },
];

export const CostOperationRequestSchema = z.object({
  operation: z.enum([
    'LLM_GENERATION',
    'TRANSCRIPTION',
    'TTS',
    'IMAGE_GENERATION',
    'VIDEO_GENERATION',
    'RENDERING',
    'STORAGE',
  ]),
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  quantity: z.number().nonnegative(),
});
export type CostOperationRequest = z.infer<typeof CostOperationRequestSchema>;

export const EstimateCostRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  operations: z.array(CostOperationRequestSchema).min(1).max(25),
});
export type EstimateCostRequest = z.infer<typeof EstimateCostRequestSchema>;

export const UpsertBudgetPolicyRequestSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  monthlyLimitUsd: z.number().nonnegative().max(1_000_000),
  perOperationLimitUsd: z.number().nonnegative().max(100_000),
  approvalThresholdUsd: z.number().nonnegative().max(100_000),
  enforceHardStop: z.boolean().default(false),
});
export type UpsertBudgetPolicyRequest = z.infer<typeof UpsertBudgetPolicyRequestSchema>;

// -----------------------------------------------------------------------------
// 3. FFmpeg Technical Signal QA Contract (Stage 2E)
// -----------------------------------------------------------------------------

export const SignalQaStatusSchema = z.enum(['PASSED', 'WARNING', 'FAILED', 'NOT_APPLICABLE']);
export type SignalQaStatus = z.infer<typeof SignalQaStatusSchema>;

export const SignalQaCheckSchema = z.object({
  checkId: z.string(),
  category: z.enum(['VIDEO', 'AUDIO', 'OUTPUT']),
  status: SignalQaStatusSchema,
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  measuredValue: z.string(),
  expectedValue: z.string(),
  timestampSec: z.number().nonnegative().nullable(),
  message: z.string(),
  remediation: z.string().nullable(),
});
export type SignalQaCheck = z.infer<typeof SignalQaCheckSchema>;

export const SignalQaReportSchema = z.object({
  overallStatus: SignalQaStatusSchema,
  technicallyVerified: z.boolean(),
  tool: z.string(),
  toolVersion: z.string(),
  checkedAt: z.string().datetime(),
  checks: z.array(SignalQaCheckSchema),
});
export type SignalQaReport = z.infer<typeof SignalQaReportSchema>;
