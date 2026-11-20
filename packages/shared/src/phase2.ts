import { z } from 'zod';
import {
  CompositionPatchOperationSchema,
  CompositionTemplateIdSchema,
  SceneLayoutTypeSchema,
} from './composition.js';
import { AspectRatioSchema, TargetPlatformSchema } from './workflow.js';

// -----------------------------------------------------------------------------
// Agent 1: Content Intelligence Agent Schemas
// -----------------------------------------------------------------------------

export const HookCandidateSchema = z.object({
  assetId: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  hookText: z.string().min(1),
  hookScore: z.number().min(0).max(1),
});
export type HookCandidate = z.infer<typeof HookCandidateSchema>;

export const BrollCandidateSchema = z.object({
  assetId: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  description: z.string().min(1),
});
export type BrollCandidate = z.infer<typeof BrollCandidateSchema>;

export const AssetIntelligenceReportSchema = z.object({
  projectId: z.string(),
  analyzedAssetCount: z.number().int().nonnegative(),
  primaryTheme: z.string().min(1),
  detectedSpeakers: z.array(z.string()),
  topHooks: z.array(HookCandidateSchema),
  brollCandidates: z.array(BrollCandidateSchema),
  recommendedPlatform: TargetPlatformSchema,
  recommendedTemplateId: CompositionTemplateIdSchema,
  summary: z.string().min(1),
});
export type AssetIntelligenceReport = z.infer<typeof AssetIntelligenceReportSchema>;

// -----------------------------------------------------------------------------
// Agent 2: Creative Director Agent Schemas
// -----------------------------------------------------------------------------

export const DeliverableSceneBriefSchema = z.object({
  sceneIndex: z.number().int().nonnegative(),
  purpose: z.enum(['HOOK', 'VALUE_POINT', 'PROOF_BROLL', 'CTA']),
  durationSec: z.number().positive(),
  layout: SceneLayoutTypeSchema,
  visualDirection: z.string().min(1),
});
export type DeliverableSceneBrief = z.infer<typeof DeliverableSceneBriefSchema>;

export const CreativeProductionPlanSchema = z.object({
  objective: z.string().min(1),
  targetPlatform: TargetPlatformSchema,
  aspectRatio: AspectRatioSchema,
  templateId: CompositionTemplateIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(30), z.literal(60)]),
  totalDurationSec: z.number().positive(),
  hookStrategy: z.string().min(1),
  visualStyle: z.string().min(1),
  captionStyle: z.enum(['word-highlight', 'karaoke-pop', 'minimal-lower', 'kinetic-center']),
  musicMood: z.string().min(1),
  sceneCount: z.number().int().min(1),
  deliverableBriefs: z.array(DeliverableSceneBriefSchema).min(1),
});
export type CreativeProductionPlan = z.infer<typeof CreativeProductionPlanSchema>;

// -----------------------------------------------------------------------------
// Agent 3: Scriptwriter Agent Schemas
// -----------------------------------------------------------------------------

export const WordTimestampSchema = z.object({
  word: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  confidence: z.number().min(0).max(1).default(0.98),
});
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;

export const ScriptSceneSpecSchema = z.object({
  sceneId: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  durationSec: z.number().positive(),
  layout: SceneLayoutTypeSchema,
  headlineText: z.string().min(1),
  narrationText: z.string().min(1),
  primaryAssetId: z.string().optional(),
  brollAssetId: z.string().optional(),
  wordTimestamps: z.array(WordTimestampSchema),
});
export type ScriptSceneSpec = z.infer<typeof ScriptSceneSpecSchema>;

export const VideoScriptSpecSchema = z.object({
  title: z.string().min(1),
  hookLine: z.string().min(1),
  ctaLine: z.string().min(1),
  estimatedDurationSec: z.number().positive(),
  voiceoverFullText: z.string().min(1),
  scenes: z.array(ScriptSceneSpecSchema).min(1),
});
export type VideoScriptSpec = z.infer<typeof VideoScriptSpecSchema>;

// -----------------------------------------------------------------------------
// Agent 7: Quality Assurance Agent & Frame Inspection Schemas
// -----------------------------------------------------------------------------

export const QaDefectTypeSchema = z.enum([
  'TEXT_OVERFLOW',
  'BAD_CONTRAST',
  'EMPTY_FRAME',
  'CAPTION_MISALIGNMENT',
  'SAFE_ZONE_VIOLATION',
]);
export type QaDefectType = z.infer<typeof QaDefectTypeSchema>;

export const QaDefectSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  timestampSec: z.number().nonnegative(),
  type: QaDefectTypeSchema,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string().min(1),
  sceneId: z.string().optional(),
});
export type QaDefect = z.infer<typeof QaDefectSchema>;

export const QaInspectionReportSchema = z.object({
  passed: z.boolean(),
  overallScore: z.number().int().min(0).max(100),
  defects: z.array(QaDefectSchema),
  patchInstructions: z.array(CompositionPatchOperationSchema),
  summary: z.string().min(1),
});
export type QaInspectionReport = z.infer<typeof QaInspectionReportSchema>;

// -----------------------------------------------------------------------------
// Phase 2 API Request Schemas
// -----------------------------------------------------------------------------

export const ExecuteProductionWorkflowRequestSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  userPrompt: z.string().trim().min(3).max(8000),
  targetPlatform: TargetPlatformSchema.optional(),
  templateId: CompositionTemplateIdSchema.optional(),
  simulateDefectsOnce: z.boolean().optional(),
});
export type ExecuteProductionWorkflowRequest = z.infer<
  typeof ExecuteProductionWorkflowRequestSchema
>;

export const ReviseWorkflowRequestSchema = z.object({
  instruction: z.string().trim().min(2).max(4000),
  patches: z.array(CompositionPatchOperationSchema).optional(),
});
export type ReviseWorkflowRequest = z.infer<typeof ReviseWorkflowRequestSchema>;

export const PatchCompositionRequestSchema = z.object({
  changeSummary: z.string().trim().min(2).max(500),
  patches: z.array(CompositionPatchOperationSchema).min(1),
});
export type PatchCompositionRequest = z.infer<typeof PatchCompositionRequestSchema>;
