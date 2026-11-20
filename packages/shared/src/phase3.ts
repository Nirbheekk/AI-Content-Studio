import { z } from 'zod';
import {
  CompositionSpec,
  CompositionTemplateIdSchema,
  OverlayComponentTypeSchema,
  SceneLayoutTypeSchema,
  TransitionTypeSchema,
} from './composition.js';
import { AspectRatioSchema, TargetPlatformSchema } from './workflow.js';

// -----------------------------------------------------------------------------
// 1. Granular AI Scene Editing Schemas (Priority 4)
// -----------------------------------------------------------------------------

export const GranularSceneEditRequestSchema = z.object({
  instruction: z.string().trim().min(2).max(2000),
  headlineText: z.string().trim().max(120).optional(),
  narrationText: z.string().trim().max(1000).optional(),
  layout: SceneLayoutTypeSchema.optional(),
  transitionIn: TransitionTypeSchema.optional(),
  durationInFrames: z.number().int().min(15).max(3600).optional(),
  trimStartSec: z.number().nonnegative().optional(),
  addOverlayComponent: OverlayComponentTypeSchema.optional(),
});
export type GranularSceneEditRequest = z.infer<typeof GranularSceneEditRequestSchema>;

// -----------------------------------------------------------------------------
// 2. Multi-Aspect-Ratio & Platform Layout Adaptation (Priority 6)
// -----------------------------------------------------------------------------

export const AdaptAspectRatioRequestSchema = z.object({
  aspectRatio: AspectRatioSchema,
  targetPlatform: TargetPlatformSchema.optional(),
  templateId: CompositionTemplateIdSchema.optional(),
});
export type AdaptAspectRatioRequest = z.infer<typeof AdaptAspectRatioRequestSchema>;

export const ASPECT_RATIO_DIMENSIONS: Record<
  z.infer<typeof AspectRatioSchema>,
  { width: number; height: number; safeBottomMarginPx: number }
> = {
  PORTRAIT_9_16: { width: 1080, height: 1920, safeBottomMarginPx: 220 },
  LANDSCAPE_16_9: { width: 1920, height: 1080, safeBottomMarginPx: 100 },
  SQUARE_1_1: { width: 1080, height: 1080, safeBottomMarginPx: 120 },
  PORTRAIT_4_5: { width: 1080, height: 1350, safeBottomMarginPx: 140 },
};

// -----------------------------------------------------------------------------
// 3. Content Repurposing Engine Schemas (Priority 5)
// -----------------------------------------------------------------------------

export const RepurposeFormatTargetSchema = z.object({
  platform: TargetPlatformSchema,
  aspectRatio: AspectRatioSchema,
  templateId: CompositionTemplateIdSchema,
  count: z.number().int().min(1).max(10).default(1),
});
export type RepurposeFormatTarget = z.infer<typeof RepurposeFormatTargetSchema>;

export const ExecuteRepurposeCampaignRequestSchema = z.object({
  projectId: z.string().uuid(),
  sourceAssetId: z.string().uuid().optional(),
  campaignTitle: z.string().trim().min(2).max(160),
  creativeBrief: z.string().trim().min(3).max(4000),
  targets: z.array(RepurposeFormatTargetSchema).min(1).max(12),
  includeQuoteGraphics: z.boolean().default(true),
  includeWrittenPosts: z.boolean().default(true),
  autoRenderPreviews: z.boolean().default(true),
});
export type ExecuteRepurposeCampaignRequest = z.infer<
  typeof ExecuteRepurposeCampaignRequestSchema
>;

export const QuoteGraphicDeliverableSchema = z.object({
  id: z.string(),
  quoteText: z.string(),
  attribution: z.string(),
  aspectRatio: AspectRatioSchema,
  primaryColor: z.string(),
  accentColor: z.string(),
});
export type QuoteGraphicDeliverable = z.infer<typeof QuoteGraphicDeliverableSchema>;

export const WrittenPostDeliverableSchema = z.object({
  id: z.string(),
  platform: TargetPlatformSchema,
  hookHeadline: z.string(),
  bodyText: z.string(),
  hashtags: z.array(z.string()),
});
export type WrittenPostDeliverable = z.infer<typeof WrittenPostDeliverableSchema>;

// -----------------------------------------------------------------------------
// 4. Composition Version Comparison & Diff Engine (Priority 7)
// -----------------------------------------------------------------------------

export interface SceneDiffEntry {
  sceneId: string;
  status: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
  changes: string[];
}

export interface CompositionVersionDiffReport {
  fromVersionNumber: number;
  toVersionNumber: number;
  dimensionsChanged: boolean;
  fromDimensions: { width: number; height: number; fps: number; durationInFrames: number };
  toDimensions: { width: number; height: number; fps: number; durationInFrames: number };
  brandChanges: string[];
  captionChanges: string[];
  audioChanges: string[];
  sceneDiffs: SceneDiffEntry[];
  totalChangesCount: number;
}

export function compareCompositionSpecs(
  fromVersionNumber: number,
  fromSpec: CompositionSpec,
  toVersionNumber: number,
  toSpec: CompositionSpec,
): CompositionVersionDiffReport {
  const dimensionsChanged =
    fromSpec.width !== toSpec.width ||
    fromSpec.height !== toSpec.height ||
    fromSpec.fps !== toSpec.fps ||
    fromSpec.durationInFrames !== toSpec.durationInFrames;

  const brandChanges: string[] = [];
  if (fromSpec.brand.primaryColor !== toSpec.brand.primaryColor) {
    brandChanges.push(`primaryColor: ${fromSpec.brand.primaryColor} -> ${toSpec.brand.primaryColor}`);
  }
  if (fromSpec.brand.secondaryColor !== toSpec.brand.secondaryColor) {
    brandChanges.push(
      `secondaryColor: ${fromSpec.brand.secondaryColor} -> ${toSpec.brand.secondaryColor}`,
    );
  }
  if (fromSpec.brand.accentColor !== toSpec.brand.accentColor) {
    brandChanges.push(`accentColor: ${fromSpec.brand.accentColor} -> ${toSpec.brand.accentColor}`);
  }
  if (fromSpec.brand.headingFont !== toSpec.brand.headingFont) {
    brandChanges.push(`headingFont: ${fromSpec.brand.headingFont} -> ${toSpec.brand.headingFont}`);
  }

  const captionChanges: string[] = [];
  if (fromSpec.captions.fontSizePx !== toSpec.captions.fontSizePx) {
    captionChanges.push(
      `fontSizePx: ${fromSpec.captions.fontSizePx}px -> ${toSpec.captions.fontSizePx}px`,
    );
  }
  if (fromSpec.captions.style !== toSpec.captions.style) {
    captionChanges.push(`style: ${fromSpec.captions.style} -> ${toSpec.captions.style}`);
  }
  if (fromSpec.captions.safeBottomMarginPx !== toSpec.captions.safeBottomMarginPx) {
    captionChanges.push(
      `safeBottomMarginPx: ${fromSpec.captions.safeBottomMarginPx}px -> ${toSpec.captions.safeBottomMarginPx}px`,
    );
  }
  if (fromSpec.captions.highlightColor !== toSpec.captions.highlightColor) {
    captionChanges.push(
      `highlightColor: ${fromSpec.captions.highlightColor} -> ${toSpec.captions.highlightColor}`,
    );
  }

  const audioChanges: string[] = [];
  if (fromSpec.audio.musicVolume !== toSpec.audio.musicVolume) {
    audioChanges.push(`musicVolume: ${fromSpec.audio.musicVolume} -> ${toSpec.audio.musicVolume}`);
  }
  if (fromSpec.audio.duckingEnabled !== toSpec.audio.duckingEnabled) {
    audioChanges.push(
      `duckingEnabled: ${String(fromSpec.audio.duckingEnabled)} -> ${String(toSpec.audio.duckingEnabled)}`,
    );
  }

  const fromScenesById = new Map(fromSpec.scenes.map((s) => [s.id, s]));
  const toScenesById = new Map(toSpec.scenes.map((s) => [s.id, s]));
  const sceneDiffs: SceneDiffEntry[] = [];

  for (const [sceneId, toScene] of toScenesById.entries()) {
    const fromScene = fromScenesById.get(sceneId);
    if (!fromScene) {
      sceneDiffs.push({
        sceneId,
        status: 'ADDED',
        changes: [`Added scene "${toScene.headlineText ?? sceneId}" (${toScene.durationInFrames}f)`],
      });
      continue;
    }

    const changes: string[] = [];
    if (fromScene.orderIndex !== toScene.orderIndex) {
      changes.push(`orderIndex: ${fromScene.orderIndex} -> ${toScene.orderIndex}`);
    }
    if (fromScene.durationInFrames !== toScene.durationInFrames) {
      changes.push(`durationInFrames: ${fromScene.durationInFrames} -> ${toScene.durationInFrames}`);
    }
    if (fromScene.trimStartSec !== toScene.trimStartSec) {
      changes.push(`trimStartSec: ${fromScene.trimStartSec}s -> ${toScene.trimStartSec}s`);
    }
    if (fromScene.layout !== toScene.layout) {
      changes.push(`layout: ${fromScene.layout} -> ${toScene.layout}`);
    }
    if (fromScene.headlineText !== toScene.headlineText) {
      changes.push(
        `headlineText: "${fromScene.headlineText ?? ''}" -> "${toScene.headlineText ?? ''}"`,
      );
    }
    if (fromScene.narrationText !== toScene.narrationText) {
      changes.push(
        `narrationText: "${fromScene.narrationText ?? ''}" -> "${toScene.narrationText ?? ''}"`,
      );
    }
    if (fromScene.transitionIn !== toScene.transitionIn) {
      changes.push(`transitionIn: ${fromScene.transitionIn} -> ${toScene.transitionIn}`);
    }
    if (fromScene.overlays.length !== toScene.overlays.length) {
      changes.push(`overlays count: ${fromScene.overlays.length} -> ${toScene.overlays.length}`);
    }

    sceneDiffs.push({
      sceneId,
      status: changes.length > 0 ? 'MODIFIED' : 'UNCHANGED',
      changes,
    });
  }

  for (const [sceneId, fromScene] of fromScenesById.entries()) {
    if (!toScenesById.has(sceneId)) {
      sceneDiffs.push({
        sceneId,
        status: 'REMOVED',
        changes: [`Removed scene "${fromScene.headlineText ?? sceneId}"`],
      });
    }
  }

  const modifiedSceneChangesCount = sceneDiffs.reduce((acc, s) => acc + s.changes.length, 0);
  const totalChangesCount =
    (dimensionsChanged ? 1 : 0) +
    brandChanges.length +
    captionChanges.length +
    audioChanges.length +
    modifiedSceneChangesCount;

  return {
    fromVersionNumber,
    toVersionNumber,
    dimensionsChanged,
    fromDimensions: {
      width: fromSpec.width,
      height: fromSpec.height,
      fps: fromSpec.fps,
      durationInFrames: fromSpec.durationInFrames,
    },
    toDimensions: {
      width: toSpec.width,
      height: toSpec.height,
      fps: toSpec.fps,
      durationInFrames: toSpec.durationInFrames,
    },
    brandChanges,
    captionChanges,
    audioChanges,
    sceneDiffs,
    totalChangesCount,
  };
}

// -----------------------------------------------------------------------------
// 5. Collaboration Comments & Brand Kit Application Schemas (Priority 3 & 7)
// -----------------------------------------------------------------------------

export const CreateCompositionCommentRequestSchema = z.object({
  versionNumber: z.number().int().positive().optional(),
  sceneId: z.string().trim().min(1).optional(),
  frameIndex: z.number().int().nonnegative().optional(),
  content: z.string().trim().min(1).max(2000),
});
export type CreateCompositionCommentRequest = z.infer<
  typeof CreateCompositionCommentRequestSchema
>;

export const UpdateBrandKitFullRequestSchema = z.object({
  brandName: z.string().trim().min(2).max(120),
  logoAssetId: z.string().uuid().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  headingFont: z.string().trim().min(1).max(80),
  bodyFont: z.string().trim().min(1).max(80),
  toneOfVoice: z.string().trim().min(2).max(500),
  editingStyle: z.string().trim().min(2).max(500),
  captionStyle: z
    .enum(['word-highlight', 'karaoke-pop', 'minimal-lower', 'kinetic-center'])
    .default('word-highlight'),
  captionFontSizePx: z.number().int().min(20).max(120).default(56),
  targetAudience: z.string().trim().max(500).optional(),
  contentObjectives: z.string().trim().max(500).optional(),
  guidelinesText: z.string().trim().max(4000).optional(),
});
export type UpdateBrandKitFullRequest = z.infer<typeof UpdateBrandKitFullRequestSchema>;
