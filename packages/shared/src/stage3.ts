import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 3 — Editorial Intelligence, Semantic Search & Story Planning Contracts
// -----------------------------------------------------------------------------

export const SemanticMediaSearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  projectId: z.string().uuid().optional(),
  folderPath: z.string().trim().max(200).optional(),
  assetType: z.enum(['VIDEO', 'AUDIO', 'IMAGE', 'DOCUMENT']).optional(),
  minDurationSec: z.number().nonnegative().optional(),
  maxDurationSec: z.number().positive().optional(),
  limit: z.number().int().min(1).max(30).default(10),
});
export type SemanticMediaSearchRequest = z.infer<typeof SemanticMediaSearchRequestSchema>;

export const SemanticMediaSearchHitSchema = z.object({
  hitId: z.string(),
  assetId: z.string().uuid(),
  fileName: z.string(),
  assetType: z.string(),
  folderPath: z.string(),
  streamUrl: z.string().nullable(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  matchingTranscript: z.string(),
  visualDescription: z.string(),
  matchExplanation: z.string(),
  confidence: z.number().min(0).max(1),
  rightsStatus: z.string(),
});
export type SemanticMediaSearchHit = z.infer<typeof SemanticMediaSearchHitSchema>;

export const HighlightDiscoveryRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  targetDurationSec: z.number().int().min(8).max(90).default(25),
  maxHighlights: z.number().int().min(1).max(12).default(5),
  focusTopic: z.string().trim().max(300).optional(),
});
export type HighlightDiscoveryRequest = z.infer<typeof HighlightDiscoveryRequestSchema>;

export const HighlightCandidateSchema = z.object({
  highlightId: z.string(),
  assetId: z.string().uuid(),
  fileName: z.string(),
  streamUrl: z.string().nullable(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  durationSec: z.number().positive(),
  transcript: z.string(),
  contextBefore: z.string(),
  contextAfter: z.string(),
  suggestedHook: z.string(),
  category: z.enum(['STRONG_STATEMENT', 'PRODUCT_DEMO', 'EXPLANATION', 'QA_INSIGHT', 'EMOTIONAL_BEAT']),
  relevanceScore: z.number().int().min(1).max(100),
  editorialRationale: z.string(),
  supportingVisualEvidence: z.string(),
  confidence: z.number().min(0).max(1),
  editingRequirements: z.array(z.string()),
});
export type HighlightCandidate = z.infer<typeof HighlightCandidateSchema>;

export const ScriptSectionProvenanceSchema = z.enum([
  'DIRECT_QUOTE',
  'PARAPHRASE',
  'AI_NARRATION',
]);
export type ScriptSectionProvenance = z.infer<typeof ScriptSectionProvenanceSchema>;

export const EditorialScriptSectionSchema = z.object({
  order: z.number().int().positive(),
  role: z.enum(['HOOK', 'BODY', 'PROOF', 'CTA']),
  provenance: ScriptSectionProvenanceSchema,
  text: z.string(),
  sourceAssetId: z.string().uuid().nullable(),
  startSec: z.number().nonnegative().nullable(),
  endSec: z.number().nonnegative().nullable(),
  visualDirection: z.string(),
});
export type EditorialScriptSection = z.infer<typeof EditorialScriptSectionSchema>;

export const EditorialQualityRubricSchema = z.object({
  hookClarity: z.number().int().min(0).max(100),
  topicRelevance: z.number().int().min(0).max(100),
  narrativeCompleteness: z.number().int().min(0).max(100),
  specificity: z.number().int().min(0).max(100),
  nonRepetition: z.number().int().min(0).max(100),
  contextPreservation: z.number().int().min(0).max(100),
  evidenceSupport: z.number().int().min(0).max(100),
  pacingPotential: z.number().int().min(0).max(100),
  visualSupport: z.number().int().min(0).max(100),
  brandAlignment: z.number().int().min(0).max(100),
  ctaRelevance: z.number().int().min(0).max(100),
  overallScore: z.number().int().min(0).max(100),
  note: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvements: z.array(z.string()),
});
export type EditorialQualityRubric = z.infer<typeof EditorialQualityRubricSchema>;

export const GenerateEditorialPlanRequestSchema = z.object({
  projectId: z.string().uuid(),
  brief: z.string().trim().min(5).max(4000),
  audience: z.string().trim().max(200).default('Target buyers & creators'),
  objective: z.string().trim().max(200).default('Explain value clearly and drive action'),
  platform: z.string().trim().max(64).default('INSTAGRAM_REELS'),
  targetDurationSec: z.number().int().min(10).max(120).default(30),
  tone: z.string().trim().max(120).default('Authentic, specific, non-generic'),
  cta: z.string().trim().max(200).default('Try it on your next project'),
  conceptCount: z.number().int().min(1).max(5).default(3),
});
export type GenerateEditorialPlanRequest = z.infer<typeof GenerateEditorialPlanRequestSchema>;

export const UpdateEditorialConceptRequestSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  hook: z.string().trim().min(2).max(300).optional(),
  cta: z.string().trim().min(2).max(240).optional(),
  status: z.enum(['PROPOSED', 'APPROVED', 'REJECTED']).optional(),
  reviewerNotes: z.string().trim().max(1000).optional(),
});
export type UpdateEditorialConceptRequest = z.infer<typeof UpdateEditorialConceptRequestSchema>;

export const CorrectTranscriptRequestSchema = z.object({
  correctedText: z.string().trim().min(1).max(100_000),
});
export type CorrectTranscriptRequest = z.infer<typeof CorrectTranscriptRequestSchema>;
