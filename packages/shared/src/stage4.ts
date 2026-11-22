import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 4 — Professional Shorts Factory Contracts
// -----------------------------------------------------------------------------

export const CaptionPresetIdSchema = z.enum([
  'clean-minimal',
  'bold-creator',
  'kinetic-word-highlight',
  'podcast-premium',
  'cinematic-subtitles',
  'high-energy-shorts',
  'educational-explainer',
  'brand-custom',
]);
export type CaptionPresetId = z.infer<typeof CaptionPresetIdSchema>;

export interface CaptionPresetSpec {
  id: CaptionPresetId;
  name: string;
  description: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontSizePx: number;
  maxLines: number;
  maxWordsPerLine: number;
  position: 'safe-bottom' | 'center-seam' | 'upper-third';
  marginV: number;
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  backgroundColor: string;
  outlinePx: number;
  shadowPx: number;
  animation: 'karaoke-fill' | 'word-pop' | 'fade-slide' | 'none';
  uppercase: boolean;
}

export const CAPTION_PRESETS: readonly CaptionPresetSpec[] = [
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    description: 'Readable sans-serif subtitles with subtle shadow and zero visual clutter.',
    fontFamily: 'Open Sans',
    fontWeight: 'normal',
    fontSizePx: 46,
    maxLines: 2,
    maxWordsPerLine: 5,
    position: 'safe-bottom',
    marginV: 240,
    primaryColor: '#FFFFFF',
    highlightColor: '#F4F4F5',
    outlineColor: '#111111',
    backgroundColor: '#00000099',
    outlinePx: 3,
    shadowPx: 2,
    animation: 'fade-slide',
    uppercase: false,
  },
  {
    id: 'bold-creator',
    name: 'Bold Creator',
    description: 'High-contrast uppercase creator captions with active word highlight.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 58,
    maxLines: 2,
    maxWordsPerLine: 4,
    position: 'safe-bottom',
    marginV: 280,
    primaryColor: '#FFFFFF',
    highlightColor: '#FFE600',
    outlineColor: '#000000',
    backgroundColor: '#000000B0',
    outlinePx: 6,
    shadowPx: 3,
    animation: 'karaoke-fill',
    uppercase: true,
  },
  {
    id: 'kinetic-word-highlight',
    name: 'Kinetic Word Highlight',
    description: 'Rapid 2–3 word active-word pop synced to spoken cadence.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 64,
    maxLines: 1,
    maxWordsPerLine: 3,
    position: 'center-seam',
    marginV: 720,
    primaryColor: '#FFFFFF',
    highlightColor: '#22D3EE',
    outlineColor: '#000000',
    backgroundColor: '#000000C0',
    outlinePx: 7,
    shadowPx: 3,
    animation: 'word-pop',
    uppercase: true,
  },
  {
    id: 'podcast-premium',
    name: 'Podcast Premium',
    description: 'Warm conversational captions with crisp lower-third framing for interviews.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 50,
    maxLines: 2,
    maxWordsPerLine: 5,
    position: 'safe-bottom',
    marginV: 260,
    primaryColor: '#FAF9F6',
    highlightColor: '#F59E0B',
    outlineColor: '#18181B',
    backgroundColor: '#18181BCC',
    outlinePx: 4,
    shadowPx: 2,
    animation: 'karaoke-fill',
    uppercase: false,
  },
  {
    id: 'cinematic-subtitles',
    name: 'Cinematic Subtitles',
    description: 'Restrained film-style subtitles with wide breathing room.',
    fontFamily: 'Open Sans',
    fontWeight: 'normal',
    fontSizePx: 40,
    maxLines: 2,
    maxWordsPerLine: 7,
    position: 'safe-bottom',
    marginV: 200,
    primaryColor: '#F8FAFC',
    highlightColor: '#F8FAFC',
    outlineColor: '#09090B',
    backgroundColor: '#00000066',
    outlinePx: 2,
    shadowPx: 2,
    animation: 'none',
    uppercase: false,
  },
  {
    id: 'high-energy-shorts',
    name: 'High-Energy Shorts',
    description: 'Seam-positioned neon karaoke ideal for split-screen & gaming highlights.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 60,
    maxLines: 2,
    maxWordsPerLine: 4,
    position: 'center-seam',
    marginV: 765,
    primaryColor: '#FFFFFF',
    highlightColor: '#00E6FF',
    outlineColor: '#000000',
    backgroundColor: '#000000C0',
    outlinePx: 7,
    shadowPx: 3,
    animation: 'karaoke-fill',
    uppercase: true,
  },
  {
    id: 'educational-explainer',
    name: 'Educational Explainer',
    description: 'Structured phrase captions emphasizing key instructional terms.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 48,
    maxLines: 2,
    maxWordsPerLine: 5,
    position: 'safe-bottom',
    marginV: 250,
    primaryColor: '#FFFFFF',
    highlightColor: '#34D399',
    outlineColor: '#0F172A',
    backgroundColor: '#0F172ACC',
    outlinePx: 4,
    shadowPx: 2,
    animation: 'karaoke-fill',
    uppercase: false,
  },
  {
    id: 'brand-custom',
    name: 'Brand Custom',
    description: 'Automatically inherits active workspace Brand Kit primary, accent, and typography.',
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSizePx: 52,
    maxLines: 2,
    maxWordsPerLine: 4,
    position: 'safe-bottom',
    marginV: 260,
    primaryColor: '#FFFFFF',
    highlightColor: '#6366F1',
    outlineColor: '#09090B',
    backgroundColor: '#09090BCC',
    outlinePx: 5,
    shadowPx: 2,
    animation: 'karaoke-fill',
    uppercase: false,
  },
];

export const MotionPresetIdSchema = z.enum([
  'subtle',
  'professional',
  'energetic',
  'cinematic',
  'educational',
]);
export type MotionPresetId = z.infer<typeof MotionPresetIdSchema>;

export interface MotionPresetSpec {
  id: MotionPresetId;
  name: string;
  description: string;
  defaultTransition: 'fade' | 'slide-up' | 'zoom-punch' | 'wipe-left' | 'none';
  zoomIntensity: number;
  lowerThirdStyle: 'minimal' | 'editorial' | 'bold';
  showProgressBar: boolean;
}

export const MOTION_PRESETS: readonly MotionPresetSpec[] = [
  {
    id: 'subtle',
    name: 'Subtle',
    description: 'Gentle fades and minimal camera motion for talking-head authority.',
    defaultTransition: 'fade',
    zoomIntensity: 1.03,
    lowerThirdStyle: 'minimal',
    showProgressBar: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Crisp slide transitions, clean lower thirds, and measured pacing.',
    defaultTransition: 'slide-up',
    zoomIntensity: 1.06,
    lowerThirdStyle: 'editorial',
    showProgressBar: true,
  },
  {
    id: 'energetic',
    name: 'Energetic',
    description: 'Punchy hook zoom, rapid emphasis beats, and progress bar.',
    defaultTransition: 'zoom-punch',
    zoomIntensity: 1.12,
    lowerThirdStyle: 'bold',
    showProgressBar: true,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Slow deliberate dissolves with restrained typography.',
    defaultTransition: 'fade',
    zoomIntensity: 1.04,
    lowerThirdStyle: 'minimal',
    showProgressBar: false,
  },
  {
    id: 'educational',
    name: 'Educational',
    description: 'Chapter markers, structured callouts, and clear slide pacing.',
    defaultTransition: 'wipe-left',
    zoomIntensity: 1.05,
    lowerThirdStyle: 'editorial',
    showProgressBar: true,
  },
];

// Smart Cutting Contracts (Feature B)
export const SmartCutPresetSchema = z.enum([
  'GENTLE',
  'BALANCED',
  'AGGRESSIVE',
  'MANUAL_REVIEW',
]);
export type SmartCutPreset = z.infer<typeof SmartCutPresetSchema>;

export const SmartCutKindSchema = z.enum([
  'LONG_SILENCE',
  'FILLER_WORD',
  'REPEATED_PHRASE',
  'FALSE_START',
]);
export type SmartCutKind = z.infer<typeof SmartCutKindSchema>;

export const SmartCutProposalSchema = z.object({
  cutId: z.string(),
  kind: SmartCutKindSchema,
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  durationSec: z.number().positive(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  protectedDramaticPause: z.boolean().default(false),
  accepted: z.boolean(),
});
export type SmartCutProposal = z.infer<typeof SmartCutProposalSchema>;

export const AnalyzeSmartCutsRequestSchema = z.object({
  assetId: z.string().uuid(),
  preset: SmartCutPresetSchema.default('BALANCED'),
});
export type AnalyzeSmartCutsRequest = z.infer<typeof AnalyzeSmartCutsRequestSchema>;

// Batch Shorts Generation & Reframing Contracts (Features A, C, F, J)
export const FocalPointSchema = z.object({
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.45),
});
export type FocalPoint = z.infer<typeof FocalPointSchema>;

export const GenerateShortsBatchRequestSchema = z.object({
  projectId: z.string().uuid(),
  sourceAssetId: z.string().uuid().optional(),
  editorialPlanId: z.string().uuid().optional(),
  captionPresetId: CaptionPresetIdSchema.default('bold-creator'),
  motionPresetId: MotionPresetIdSchema.default('professional'),
  smartCutPreset: SmartCutPresetSchema.default('BALANCED'),
  aspectRatio: z
    .enum(['PORTRAIT_9_16', 'PORTRAIT_4_5', 'SQUARE_1_1', 'LANDSCAPE_16_9'])
    .default('PORTRAIT_9_16'),
  targetPlatform: z
    .enum(['INSTAGRAM_REELS', 'TIKTOK', 'YOUTUBE_SHORTS', 'LINKEDIN', 'FACEBOOK'])
    .default('INSTAGRAM_REELS'),
  maxShorts: z.number().int().min(1).max(6).default(3),
  targetDurationSec: z.number().int().min(10).max(60).default(22),
  focalPoint: FocalPointSchema.optional(),
  renderMp4: z.boolean().default(true),
});
export type GenerateShortsBatchRequest = z.infer<typeof GenerateShortsBatchRequestSchema>;

export const CaptionPreviewRequestSchema = z.object({
  assetId: z.string().uuid(),
  captionPresetId: CaptionPresetIdSchema.default('bold-creator'),
  maxDurationSec: z.number().positive().max(300).default(60),
});
export type CaptionPreviewRequest = z.infer<typeof CaptionPreviewRequestSchema>;

export const CreativeQaCheckSchema = z.object({
  checkId: z.string(),
  passed: z.boolean(),
  measuredValue: z.string(),
  recommendation: z.string().nullable(),
});
export type CreativeQaCheck = z.infer<typeof CreativeQaCheckSchema>;

export const CreativeQaReportSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  note: z.string(),
  checks: z.array(CreativeQaCheckSchema),
  recommendations: z.array(z.string()),
});
export type CreativeQaReport = z.infer<typeof CreativeQaReportSchema>;
