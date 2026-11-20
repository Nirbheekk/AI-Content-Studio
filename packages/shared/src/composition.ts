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
// Structured Multi-Track Partial Editing Patch Operations (Phase 2 & Phase 3)
// -----------------------------------------------------------------------------

export const CompositionPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('UPDATE_SCENE'),
    sceneId: z.string().min(1),
    patch: SceneSpecSchema.partial().omit({ id: true }),
  }),
  z.object({
    op: z.literal('ADD_SCENE'),
    scene: SceneSpecSchema.omit({ orderIndex: true, startFrame: true }),
    insertAtIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('REMOVE_SCENE'),
    sceneId: z.string().min(1),
  }),
  z.object({
    op: z.literal('REORDER_SCENES'),
    sceneIdsInOrder: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    op: z.literal('ADD_OVERLAY'),
    sceneId: z.string().min(1),
    overlay: OverlaySpecSchema,
  }),
  z.object({
    op: z.literal('REMOVE_OVERLAY'),
    sceneId: z.string().min(1),
    overlayId: z.string().min(1),
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
    op: z.literal('UPDATE_AUDIO'),
    patch: AudioSettingsSpecSchema.partial(),
  }),
  z.object({
    op: z.literal('SET_DIMENSIONS'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    templateId: CompositionTemplateIdSchema.optional(),
    safeBottomMarginPx: z.number().int().min(80).max(400).optional(),
  }),
]);
export type CompositionPatchOperation = z.infer<typeof CompositionPatchOperationSchema>;

function recalculateSceneTimeline(scenes: SceneSpec[]): {
  scenes: SceneSpec[];
  totalDurationInFrames: number;
} {
  let cursorFrame = 0;
  const normalized = scenes.map((scene, idx) => {
    const updated: SceneSpec = SceneSpecSchema.parse({
      ...scene,
      orderIndex: idx,
      startFrame: cursorFrame,
    });
    cursorFrame += updated.durationInFrames;
    return updated;
  });
  return {
    scenes: normalized,
    totalDurationInFrames: cursorFrame,
  };
}

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
        const updatedScenes = nextSpec.scenes.map((scene) =>
          scene.id === operation.sceneId
            ? SceneSpecSchema.parse({ ...scene, ...operation.patch, id: scene.id })
            : scene,
        );
        const timeline = recalculateSceneTimeline(updatedScenes);
        nextSpec = {
          ...nextSpec,
          durationInFrames: timeline.totalDurationInFrames,
          scenes: timeline.scenes,
        };
        break;
      }
      case 'ADD_SCENE': {
        const candidate: SceneSpec = SceneSpecSchema.parse({
          ...operation.scene,
          orderIndex: nextSpec.scenes.length,
          startFrame: nextSpec.durationInFrames,
        });
        const list = [...nextSpec.scenes];
        const insertIdx =
          operation.insertAtIndex !== undefined
            ? Math.min(list.length, Math.max(0, operation.insertAtIndex))
            : list.length;
        list.splice(insertIdx, 0, candidate);
        const timeline = recalculateSceneTimeline(list);
        nextSpec = {
          ...nextSpec,
          durationInFrames: timeline.totalDurationInFrames,
          scenes: timeline.scenes,
        };
        break;
      }
      case 'REMOVE_SCENE': {
        if (nextSpec.scenes.length <= 1) {
          throw new Error('Cannot remove the last remaining scene from a composition');
        }
        const remaining = nextSpec.scenes.filter((s) => s.id !== operation.sceneId);
        const timeline = recalculateSceneTimeline(remaining);
        nextSpec = {
          ...nextSpec,
          durationInFrames: timeline.totalDurationInFrames,
          scenes: timeline.scenes,
        };
        break;
      }
      case 'REORDER_SCENES': {
        const sceneById = new Map(nextSpec.scenes.map((s) => [s.id, s]));
        const reordered: SceneSpec[] = operation.sceneIdsInOrder.map((id) => {
          const existing = sceneById.get(id);
          if (!existing) {
            throw new Error(`Scene ID not found during reorder: ${id}`);
          }
          return existing;
        });
        const timeline = recalculateSceneTimeline(reordered);
        nextSpec = {
          ...nextSpec,
          durationInFrames: timeline.totalDurationInFrames,
          scenes: timeline.scenes,
        };
        break;
      }
      case 'ADD_OVERLAY': {
        const updatedScenes = nextSpec.scenes.map((scene) =>
          scene.id === operation.sceneId
            ? SceneSpecSchema.parse({
                ...scene,
                overlays: [...scene.overlays, operation.overlay],
              })
            : scene,
        );
        nextSpec = { ...nextSpec, scenes: updatedScenes };
        break;
      }
      case 'REMOVE_OVERLAY': {
        const updatedScenes = nextSpec.scenes.map((scene) =>
          scene.id === operation.sceneId
            ? SceneSpecSchema.parse({
                ...scene,
                overlays: scene.overlays.filter((ov) => ov.id !== operation.overlayId),
              })
            : scene,
        );
        nextSpec = { ...nextSpec, scenes: updatedScenes };
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
      case 'UPDATE_AUDIO': {
        nextSpec = {
          ...nextSpec,
          audio: AudioSettingsSpecSchema.parse({
            ...nextSpec.audio,
            ...operation.patch,
          }),
        };
        break;
      }
      case 'SET_DIMENSIONS': {
        nextSpec = {
          ...nextSpec,
          width: operation.width,
          height: operation.height,
          ...(operation.templateId ? { templateId: operation.templateId } : {}),
          captions: {
            ...nextSpec.captions,
            ...(operation.safeBottomMarginPx !== undefined
              ? { safeBottomMarginPx: operation.safeBottomMarginPx }
              : {}),
          },
        };
        break;
      }
    }
  }

  return CompositionSpecSchema.parse(nextSpec);
}
