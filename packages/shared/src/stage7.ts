import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 7 — Client Collaboration, Review Links, Version-Bound Approvals & Notifications
// -----------------------------------------------------------------------------

export const ReviewLinkPermissionSchema = z.enum(['VIEW_ONLY', 'COMMENT', 'APPROVE']);
export type ReviewLinkPermission = z.infer<typeof ReviewLinkPermissionSchema>;

export const ApprovalStageSchema = z.enum([
  'INTERNAL_CREATIVE',
  'CLIENT_APPROVAL',
  'PUBLISHING_APPROVAL',
]);
export type ApprovalStage = z.infer<typeof ApprovalStageSchema>;

export const ApprovalDecisionSchema = z.enum([
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const CreateReviewLinkRequestSchema = z.object({
  compositionId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  title: z.string().min(2).max(140).optional(),
  permission: ReviewLinkPermissionSchema.default('APPROVE'),
  password: z.string().min(4).max(64).optional(),
  allowDownload: z.boolean().default(false),
  expiresInHours: z.number().int().min(1).max(720).default(168),
});
export type CreateReviewLinkRequest = z.infer<typeof CreateReviewLinkRequestSchema>;

export const PublicReviewCommentRequestSchema = z.object({
  reviewerName: z.string().min(2).max(100),
  timestampSec: z.number().nonnegative().default(0),
  body: z.string().min(2).max(2000),
  password: z.string().optional(),
});
export type PublicReviewCommentRequest = z.infer<typeof PublicReviewCommentRequestSchema>;

export const PublicReviewDecisionRequestSchema = z.object({
  reviewerName: z.string().min(2).max(100),
  decision: ApprovalDecisionSchema,
  notes: z.string().max(2000).optional(),
  password: z.string().optional(),
});
export type PublicReviewDecisionRequest = z.infer<typeof PublicReviewDecisionRequestSchema>;

export const CreateInternalApprovalRequestSchema = z.object({
  compositionId: z.string().uuid(),
  stage: ApprovalStageSchema.default('INTERNAL_CREATIVE'),
  decision: ApprovalDecisionSchema,
  notes: z.string().max(2000).optional(),
});
export type CreateInternalApprovalRequest = z.infer<typeof CreateInternalApprovalRequestSchema>;
