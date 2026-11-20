import { z } from 'zod';

// -----------------------------------------------------------------------------
// Domain Enums & Schemas
// -----------------------------------------------------------------------------

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const AssetTypeSchema = z.enum(['VIDEO', 'AUDIO', 'IMAGE', 'DOCUMENT']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetStatusSchema = z.enum(['UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const WorkflowStageSchema = z.enum([
  'PENDING',
  'ANALYZING',
  'PLANNING',
  'SCRIPTING',
  'COMPOSING',
  'RENDERING',
  'REVIEWING',
  'REVISING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
]);
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

export const AgentTypeSchema = z.enum([
  'CONTENT_INTELLIGENCE',
  'CREATIVE_DIRECTOR',
  'SCRIPTWRITER',
  'VIDEO_EDITOR',
  'MOTION_DESIGNER',
  'RENDERING',
  'QUALITY_ASSURANCE',
  'PUBLISHING',
  'ANALYTICS',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AspectRatioSchema = z.enum([
  'PORTRAIT_9_16',
  'LANDSCAPE_16_9',
  'SQUARE_1_1',
  'PORTRAIT_4_5',
]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const TargetPlatformSchema = z.enum([
  'INSTAGRAM_REELS',
  'TIKTOK',
  'YOUTUBE_SHORTS',
  'YOUTUBE_LONG',
  'LINKEDIN',
  'X_TWITTER',
  'FACEBOOK',
]);
export type TargetPlatform = z.infer<typeof TargetPlatformSchema>;

export const RenderStatusSchema = z.enum([
  'QUEUED',
  'RENDERING',
  'EXTRACTING_FRAMES',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const PublishStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
]);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

// -----------------------------------------------------------------------------
// Persistent Workflow State Machine Rules
// -----------------------------------------------------------------------------

export const WORKFLOW_STAGE_TRANSITIONS: Record<WorkflowStage, readonly WorkflowStage[]> = {
  PENDING: ['ANALYZING', 'FAILED', 'CANCELLED'],
  ANALYZING: ['PLANNING', 'FAILED', 'CANCELLED'],
  PLANNING: ['SCRIPTING', 'FAILED', 'CANCELLED'],
  SCRIPTING: ['COMPOSING', 'FAILED', 'CANCELLED'],
  COMPOSING: ['RENDERING', 'FAILED', 'CANCELLED'],
  RENDERING: ['REVIEWING', 'FAILED', 'CANCELLED'],
  REVIEWING: ['REVISING', 'AWAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  REVISING: ['RENDERING', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'REVISING', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED'],
  SCHEDULED: ['PUBLISHED', 'FAILED', 'CANCELLED'],
  PUBLISHED: [],
  FAILED: ['PENDING', 'ANALYZING', 'PLANNING', 'SCRIPTING', 'COMPOSING', 'RENDERING', 'REVIEWING'],
  CANCELLED: [],
};

export function canTransitionWorkflowStage(from: WorkflowStage, to: WorkflowStage): boolean {
  return WORKFLOW_STAGE_TRANSITIONS[from].includes(to);
}
