import { z } from 'zod';

// -----------------------------------------------------------------------------
// Remotion Declarative Composition AST (Section 5 & 11.6)
// -----------------------------------------------------------------------------

export const OverlayComponentTypeSchema = z.enum([
  'AnimatedHeadline',
  'KineticTypography',
  'WordSyncedCaptions',
  'TalkingHeadLayout',
  'PodcastSplitLayout',
  'SplitScreenComposition',
  'BrollTransition',
  'ImageAnimation',
  'ChartGraphic',
  'LowerThird',
  'ProgressBar',
  'BackgroundEffect',
  'SoundVisualization',
  'LogoAnimation',
  'OutroSequence',
  'CallToActionScene',
]);
export type OverlayComponentType = z.infer<typeof OverlayComponentTypeSchema>;

export const CompositionTemplateIdSchema = z.enum([
  'instagram-reel',
  'tiktok-short',
  'youtube-short',
  'youtube-long',
  'product-demo',
  'educational-video',
  'podcast-clip',
  'promotional-video',
  'data-explainer',
]);
export type CompositionTemplateId = z.infer<typeof CompositionTemplateIdSchema>;

export const SceneLayoutTypeSchema = z.enum([
  'talking-head',
  'podcast-split',
  'b-roll-overlay',
  'full-bleed',
  'data-explainer',
]);
export type SceneLayoutType = z.infer<typeof SceneLayoutTypeSchema>;

export const TransitionTypeSchema = z.enum([
  'none',
  'spring-slide',
  'fade',
  'zoom-punch',
  'whip-pan',
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const OverlaySpecSchema = z.object({
  id: z.string().min(1),
  component: OverlayComponentTypeSchema,
  startOffsetFrames: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  props: z.record(z.unknown()),
});
export type OverlaySpec = z.infer<typeof OverlaySpecSchema>;

export const SceneSpecSchema = z.object({
  id: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  layout: SceneLayoutTypeSchema,
  primaryAssetId: z.string().optional(),
  brollAssetId: z.string().optional(),
  trimStartSec: z.number().nonnegative().default(0),
  headlineText: z.string().optional(),
  narrationText: z.string().optional(),
  transitionIn: TransitionTypeSchema.default('fade'),
  overlays: z.array(OverlaySpecSchema).default([]),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const BrandSettingsSpecSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
  logoAssetId: z.string().optional(),
});
export type BrandSettingsSpec = z.infer<typeof BrandSettingsSpecSchema>;

export const CaptionSettingsSpecSchema = z.object({
  enabled: z.boolean(),
  style: z.enum(['word-highlight', 'karaoke-pop', 'minimal-lower', 'kinetic-center']),
  fontSizePx: z.number().int().min(20).max(120),
  highlightColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  safeBottomMarginPx: z.number().int().min(80).max(400),
});
export type CaptionSettingsSpec = z.infer<typeof CaptionSettingsSpecSchema>;

export const AudioSettingsSpecSchema = z.object({
  musicAssetId: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.15),
  voiceoverAssetId: z.string().optional(),
  duckingEnabled: z.boolean().default(true),
});
export type AudioSettingsSpec = z.infer<typeof AudioSettingsSpecSchema>;

export const CompositionSpecSchema = z.object({
  schemaVersion: z.literal('1.0'),
  templateId: CompositionTemplateIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(30), z.literal(60)]),
  durationInFrames: z.number().int().positive(),
  brand: BrandSettingsSpecSchema,
  captions: CaptionSettingsSpecSchema,
  audio: AudioSettingsSpecSchema,
  scenes: z.array(SceneSpecSchema).min(1),
});
export type CompositionSpec = z.infer<typeof CompositionSpecSchema>;

// -----------------------------------------------------------------------------
// Structured Partial Editing Patch Operations
// -----------------------------------------------------------------------------

export const CompositionPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('UPDATE_SCENE'),
    sceneId: z.string().min(1),
    patch: SceneSpecSchema.partial().omit({ id: true }),
  }),
  z.object({
    op: z.literal('UPDATE_CAPTION_STYLE'),
    patch: CaptionSettingsSpecSchema.partial(),
  }),
  z.object({
    op: z.literal('UPDATE_BRAND'),
    patch: BrandSettingsSpecSchema.partial(),
  }),
  z.object({
    op: z.literal('REORDER_SCENES'),
    sceneIdsInOrder: z.array(z.string().min(1)).min(1),
  }),
]);
export type CompositionPatchOperation = z.infer<typeof CompositionPatchOperationSchema>;

/**
 * Applies structured partial patch operations to an existing CompositionSpec
 * and returns a fresh, Zod-validated CompositionSpec without mutating the original.
 */
export function applyCompositionPatches(
  spec: CompositionSpec,
  operations: readonly CompositionPatchOperation[],
): CompositionSpec {
  let nextSpec: CompositionSpec = structuredClone(spec);

  for (const operation of operations) {
    switch (operation.op) {
      case 'UPDATE_SCENE': {
        nextSpec = {
          ...nextSpec,
          scenes: nextSpec.scenes.map((scene) =>
            scene.id === operation.sceneId
              ? SceneSpecSchema.parse({ ...scene, ...operation.patch, id: scene.id })
              : scene,
          ),
        };
        break;
      }
      case 'UPDATE_CAPTION_STYLE': {
        nextSpec = {
          ...nextSpec,
          captions: CaptionSettingsSpecSchema.parse({
            ...nextSpec.captions,
            ...operation.patch,
          }),
        };
        break;
      }
      case 'UPDATE_BRAND': {
        nextSpec = {
          ...nextSpec,
          brand: BrandSettingsSpecSchema.parse({
            ...nextSpec.brand,
            ...operation.patch,
          }),
        };
        break;
      }
      case 'REORDER_SCENES': {
        const sceneById = new Map(nextSpec.scenes.map((s) => [s.id, s]));
        let currentStartFrame = 0;
        const reordered: SceneSpec[] = operation.sceneIdsInOrder.map((id, index) => {
          const existing = sceneById.get(id);
          if (!existing) {
            throw new Error(`Scene ID not found during reorder: ${id}`);
          }
          const updatedScene: SceneSpec = {
            ...existing,
            orderIndex: index,
            startFrame: currentStartFrame,
          };
          currentStartFrame += existing.durationInFrames;
          return updatedScene;
        });
        nextSpec = {
          ...nextSpec,
          durationInFrames: currentStartFrame,
          scenes: reordered,
        };
        break;
      }
    }
  }

  return CompositionSpecSchema.parse(nextSpec);
}
