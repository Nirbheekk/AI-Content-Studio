import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 6 — Autonomous Creative Campaigns & Production DAG Contracts
// -----------------------------------------------------------------------------

export const CampaignStatusSchema = z.enum([
  'DRAFT',
  'PLANNING',
  'AWAITING_PLAN_APPROVAL',
  'PRODUCING',
  'CREATIVE_REVIEW',
  'AWAITING_APPROVAL',
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'PAUSED',
  'NEEDS_ATTENTION',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
  'ARCHIVED',
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CAMPAIGN_ALLOWED_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED', 'ARCHIVED'],
  PLANNING: ['AWAITING_PLAN_APPROVAL', 'FAILED', 'CANCELLED'],
  AWAITING_PLAN_APPROVAL: ['PRODUCING', 'PAUSED', 'CANCELLED', 'ARCHIVED'],
  PRODUCING: ['CREATIVE_REVIEW', 'AWAITING_APPROVAL', 'PAUSED', 'NEEDS_ATTENTION', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'],
  CREATIVE_REVIEW: ['AWAITING_APPROVAL', 'PRODUCING', 'NEEDS_ATTENTION', 'PAUSED', 'CANCELLED'],
  AWAITING_APPROVAL: ['READY_TO_SCHEDULE', 'PRODUCING', 'PAUSED', 'CANCELLED', 'ARCHIVED'],
  READY_TO_SCHEDULE: ['SCHEDULED', 'AWAITING_APPROVAL', 'PAUSED', 'CANCELLED', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHING', 'READY_TO_SCHEDULE', 'PAUSED', 'CANCELLED'],
  PUBLISHING: ['PUBLISHED', 'PARTIALLY_COMPLETED', 'FAILED'],
  PUBLISHED: ['ARCHIVED'],
  PAUSED: ['AWAITING_PLAN_APPROVAL', 'PRODUCING', 'AWAITING_APPROVAL', 'READY_TO_SCHEDULE', 'CANCELLED', 'ARCHIVED'],
  NEEDS_ATTENTION: ['PRODUCING', 'AWAITING_APPROVAL', 'CANCELLED', 'ARCHIVED'],
  PARTIALLY_COMPLETED: ['PRODUCING', 'AWAITING_APPROVAL', 'READY_TO_SCHEDULE', 'ARCHIVED'],
  FAILED: ['PRODUCING', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCampaignStatus(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_ALLOWED_TRANSITIONS[from].includes(to);
}

export const CampaignControlModeSchema = z.enum([
  'PLAN_ONLY',
  'GENERATE_DRAFTS',
  'PRODUCE_AND_REVIEW',
  'PRODUCE_UNTIL_APPROVAL',
]);
export type CampaignControlMode = z.infer<typeof CampaignControlModeSchema>;

export const CreateCampaignRequestSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(3).max(140).optional(),
  briefText: z.string().min(12).max(4000),
  objective: z.string().min(3).max(300).optional(),
  targetAudience: z.string().min(2).max(200).optional(),
  tone: z.string().min(2).max(160).optional(),
  platforms: z
    .array(z.enum(['INSTAGRAM_REELS', 'YOUTUBE_SHORTS', 'TIKTOK', 'LINKEDIN', 'FACEBOOK', 'X']))
    .min(1)
    .max(6)
    .optional(),
  deliverableCount: z.number().int().min(1).max(12).default(4),
  controlMode: CampaignControlModeSchema.default('PRODUCE_UNTIL_APPROVAL'),
  budgetCapUsd: z.number().positive().max(10000).default(50),
  scheduleWindowDays: z.number().int().min(1).max(90).default(14),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const CampaignDeliverableDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  notes: z.string().max(1000).optional(),
});
export type CampaignDeliverableDecision = z.infer<typeof CampaignDeliverableDecisionSchema>;

export const UpdateCampaignStatusSchema = z.object({
  status: z.enum(['PAUSED', 'CANCELLED', 'ARCHIVED', 'PRODUCING']),
  reason: z.string().max(500).optional(),
});
export type UpdateCampaignStatus = z.infer<typeof UpdateCampaignStatusSchema>;
