import { randomUUID } from 'node:crypto';
import {
  CAPTION_PRESETS,
  CompositionSpec,
  CompositionSpecSchema,
  CompositionTemplateId,
  CreativeQaReport,
  GenerateShortsBatchRequest,
  MOTION_PRESETS,
  NotFoundError,
  SmartCutPreset,
  ValidationError,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import {
  analyzeSmartCuts,
  applySmartCutDecisions,
  buildStyledAssFromSegments,
  evaluateCreativeShortQa,
  resolveCaptionPreset,
  TimedTranscriptSegment,
} from '@ai-content-os/remotion-engine';
import { discoverAssetHighlights } from './editorial-intelligence.service.js';
import { evaluatePublishRightsGate } from './media-rights.service.js';
import { estimateWorkflowPreflightCost } from './cost-estimator.service.js';
import { renderAndInspectCompositionVersion } from './production-pipeline.js';

interface TranscriptSegmentLike {
  startSec?: number;
  endSec?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
}

function toJson(val: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(val)) as Prisma.InputJsonValue;
}

function extractTimedSegments(segmentsJson: unknown): TimedTranscriptSegment[] {
  if (!Array.isArray(segmentsJson)) return [];
  const result: TimedTranscriptSegment[] = [];
  for (const item of segmentsJson) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as TranscriptSegmentLike;
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) continue;
    const startSec = Number(raw.startSec ?? raw.start ?? 0);
    const endSec = Number(raw.endSec ?? raw.end ?? startSec + 3);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;
    result.push({
      startSec,
      endSec,
      text,
      ...(typeof raw.speaker === 'string' ? { speaker: raw.speaker } : {}),
    });
  }
  return result.sort((a, b) => a.startSec - b.startSec);
}

function getDimensionsForAspectRatio(
  aspectRatio: GenerateShortsBatchRequest['aspectRatio'],
): { width: number; height: number } {
  switch (aspectRatio) {
    case 'PORTRAIT_4_5':
      return { width: 1080, height: 1350 };
    case 'SQUARE_1_1':
      return { width: 1080, height: 1080 };
    case 'LANDSCAPE_16_9':
      return { width: 1920, height: 1080 };
    case 'PORTRAIT_9_16':
    default:
      return { width: 1080, height: 1920 };
  }
}

function mapPlatformToTemplateId(
  platform: GenerateShortsBatchRequest['targetPlatform'],
): CompositionTemplateId {
  switch (platform) {
    case 'TIKTOK':
      return 'tiktok-short';
    case 'YOUTUBE_SHORTS':
      return 'youtube-short';
    case 'LINKEDIN':
      return 'educational-video';
    case 'INSTAGRAM_REELS':
    case 'FACEBOOK':
    default:
      return 'instagram-reel';
  }
}

function mapCaptionAnimationToSpecStyle(
  animation: 'karaoke-fill' | 'word-pop' | 'fade-slide' | 'none',
  position: 'safe-bottom' | 'center-seam' | 'upper-third',
): 'word-highlight' | 'karaoke-pop' | 'minimal-lower' | 'kinetic-center' {
  if (position === 'center-seam' && animation === 'word-pop') return 'kinetic-center';
  if (animation === 'karaoke-fill') return 'karaoke-pop';
  if (animation === 'word-pop') return 'word-highlight';
  return 'minimal-lower';
}

function mapMotionTransitionToSpec(
  t: 'fade' | 'slide-up' | 'zoom-punch' | 'wipe-left' | 'none',
): 'none' | 'spring-slide' | 'fade' | 'zoom-punch' | 'whip-pan' {
  switch (t) {
    case 'slide-up':
      return 'spring-slide';
    case 'zoom-punch':
      return 'zoom-punch';
    case 'wipe-left':
      return 'whip-pan';
    case 'none':
      return 'none';
    case 'fade':
    default:
      return 'fade';
  }
}

export async function analyzeAssetSmartCuts(params: {
  workspaceId: string;
  assetId: string;
  preset: SmartCutPreset;
}) {
  const asset = await prisma.asset.findFirst({
    where: { id: params.assetId, workspaceId: params.workspaceId },
    include: { transcript: true },
  });
  if (!asset) {
    throw new NotFoundError('Asset not found in workspace');
  }

  const segments = asset.transcript
    ? extractTimedSegments(asset.transcript.segmentsJson)
    : [];

  const analysis = analyzeSmartCuts(segments, params.preset);
  return {
    assetId: asset.id,
    assetName: asset.originalName,
    hasTranscript: segments.length > 0,
    segmentCount: segments.length,
    ...analysis,
  };
}

export async function generateCaptionPreview(params: {
  workspaceId: string;
  assetId: string;
  captionPresetId: GenerateShortsBatchRequest['captionPresetId'];
  maxDurationSec: number;
}) {
  const [asset, brandKit] = await Promise.all([
    prisma.asset.findFirst({
      where: { id: params.assetId, workspaceId: params.workspaceId },
      include: { transcript: true },
    }),
    prisma.brandKit.findFirst({
      where: { workspaceId: params.workspaceId },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  if (!asset) {
    throw new NotFoundError('Asset not found in workspace');
  }

  const rawSegments = asset.transcript
    ? extractTimedSegments(asset.transcript.segmentsJson)
    : [];
  const scopedSegments = rawSegments.filter((s) => s.startSec <= params.maxDurationSec);
  const effectiveSegments: TimedTranscriptSegment[] =
    scopedSegments.length > 0
      ? scopedSegments
      : [
          {
            startSec: 0,
            endSec: 4,
            text: asset.aiSummary?.slice(0, 120) || `Preview captions for ${asset.originalName}`,
          },
        ];

  const resolvedPreset = resolveCaptionPreset(
    params.captionPresetId,
    brandKit
      ? {
          primaryColor: brandKit.primaryColor,
          secondaryColor: brandKit.secondaryColor,
          accentColor: brandKit.accentColor,
          fontHeading: brandKit.headingFont,
        }
      : null,
  );
  const bundle = buildStyledAssFromSegments(effectiveSegments, resolvedPreset);

  return {
    assetId: asset.id,
    assetName: asset.originalName,
    usedFallbackText: scopedSegments.length === 0,
    preset: bundle.preset,
    cueCount: bundle.cues.length,
    cues: bundle.cues.slice(0, 40),
    assContent: bundle.assContent,
    srtContent: bundle.srtContent,
    vttContent: bundle.vttContent,
  };
}

export interface GeneratedShortOutcome {
  shortIndex: number;
  title: string;
  hook: string;
  sourceAssetId: string | null;
  sourceStartSec: number;
  sourceEndSec: number;
  compositionId: string;
  compositionVersionId: string;
  renderJobId: string | null;
  assetId: string | null;
  streamUrl: string | null;
  downloadUrl: string | null;
  captionPresetId: GenerateShortsBatchRequest['captionPresetId'];
  motionPresetId: GenerateShortsBatchRequest['motionPresetId'];
  smartCutSummary: {
    preset: SmartCutPreset;
    originalDurationSec: number;
    editedDurationSec: number;
    savedSec: number;
    appliedCutCount: number;
    protectedPauseCount: number;
  };
  captionBundleSummary: {
    cueCount: number;
    srtPreview: string;
  };
  creativeQa: CreativeQaReport;
  signalQa: unknown;
}

export async function generateShortsBatch(params: {
  workspaceId: string;
  userId: string;
  input: GenerateShortsBatchRequest;
  storage?: MinioStorageAdapter | undefined;
}) {
  const { workspaceId, userId, input } = params;

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
  });
  if (!project) {
    throw new NotFoundError('Project not found in workspace');
  }

  const brandKit = await prisma.brandKit.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
  });

  const resolvedCaptionPreset = resolveCaptionPreset(
    input.captionPresetId,
    brandKit
      ? {
          primaryColor: brandKit.primaryColor,
          secondaryColor: brandKit.secondaryColor,
          accentColor: brandKit.accentColor,
          fontHeading: brandKit.headingFont,
        }
      : null,
  );
  const motionPreset =
    MOTION_PRESETS.find((m) => m.id === input.motionPresetId) ?? MOTION_PRESETS[1]!;

  // 1. Rights gate & preflight cost estimate (Stage 2 reuse)
  const [rightsEvaluation, preflightCost] = await Promise.all([
    input.sourceAssetId
      ? evaluatePublishRightsGate({
          workspaceId,
          userId,
          assetId: input.sourceAssetId,
          platform: input.targetPlatform,
        })
      : Promise.resolve(null),
    estimateWorkflowPreflightCost({
      workspaceId,
      projectId: project.id,
      operations: [
        {
          operation: 'RENDERING',
          provider: 'remotion-engine',
          model: 'ffmpeg-local',
          quantity: input.maxShorts,
        },
      ],
    }),
  ]);

  if (rightsEvaluation?.decision === 'BLOCKED') {
    throw new ValidationError('Source media is blocked by workspace Media Rights Gate', {
      rightsEvaluation,
    });
  }

  // 2. Discover candidate moments using Stage 3 Editorial Intelligence
  const highlights = await discoverAssetHighlights({
    workspaceId,
    userId,
    input: {
      ...(input.sourceAssetId ? { assetId: input.sourceAssetId } : { projectId: project.id }),
      maxHighlights: input.maxShorts,
      targetDurationSec: input.targetDurationSec,
    },
  });

  // Load source asset transcript if available
  const primaryAsset = input.sourceAssetId
    ? await prisma.asset.findFirst({
        where: { id: input.sourceAssetId, workspaceId },
        include: { transcript: true },
      })
    : null;

  interface CandidateMoment {
    title: string;
    hook: string;
    excerpt: string;
    sourceAssetId: string | null;
    startSec: number;
    endSec: number;
    segments: TimedTranscriptSegment[];
  }

  const candidates: CandidateMoment[] = [];
  const allAssetSegments = primaryAsset?.transcript
    ? extractTimedSegments(primaryAsset.transcript.segmentsJson)
    : [];

  for (const h of highlights.slice(0, input.maxShorts)) {
    const windowSegs = allAssetSegments.filter(
      (s) => s.endSec >= h.startSec - 0.5 && s.startSec <= h.endSec + 0.5,
    );
    const segments: TimedTranscriptSegment[] =
      windowSegs.length > 0
        ? windowSegs
        : [
            {
              startSec: 0,
              endSec: Math.max(4, Math.round((h.endSec - h.startSec) || input.targetDurationSec)),
              text: h.transcript,
            },
          ];
    candidates.push({
      title: h.suggestedHook.slice(0, 64),
      hook: h.suggestedHook,
      excerpt: h.transcript,
      sourceAssetId: h.assetId,
      startSec: h.startSec,
      endSec: h.endSec,
      segments,
    });
  }

  // Never fabricate low-quality clips beyond available material:
  // Only fall back to 1 honest summary clip if an asset exists with no transcript yet.
  if (candidates.length === 0 && primaryAsset) {
    const dur = Math.min(input.targetDurationSec, Math.max(12, Math.round(primaryAsset.durationSec ?? 18)));
    const fallbackText =
      primaryAsset.aiSummary?.trim() ||
      `Key highlight from ${primaryAsset.originalName} prepared for ${input.targetPlatform}.`;
    candidates.push({
      title: `${primaryAsset.originalName.replace(/\.[^.]+$/, '')} — Short 1`,
      hook: `Watch this highlight from ${primaryAsset.originalName.replace(/\.[^.]+$/, '')}`,
      excerpt: fallbackText,
      sourceAssetId: primaryAsset.id,
      startSec: 0,
      endSec: dur,
      segments: [{ startSec: 0, endSec: dur, text: fallbackText }],
    });
  }

  if (candidates.length === 0) {
    throw new ValidationError(
      'No usable media moments found in this project. Upload and analyze a video or audio asset first.',
    );
  }

  const { width, height } = getDimensionsForAspectRatio(input.aspectRatio);
  const templateId = mapPlatformToTemplateId(input.targetPlatform);
  const fps = 30 as const;
  const focalPoint = input.focalPoint ?? { x: 0.5, y: 0.45 };
  const results: GeneratedShortOutcome[] = [];

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const moment = candidates[idx]!;
    const smartAnalysis = analyzeSmartCuts(moment.segments, input.smartCutPreset);
    const appliedCuts = applySmartCutDecisions(moment.segments, smartAnalysis.proposals);
    const cleanedSegments =
      appliedCuts.cleanedSegments.length > 0 ? appliedCuts.cleanedSegments : moment.segments;

    const captionBundle = buildStyledAssFromSegments(
      cleanedSegments,
      resolvedCaptionPreset,
      width,
      height,
    );

    const totalSec = Math.max(
      10,
      Math.min(
        45,
        Math.round(
          appliedCuts.editedDurationSec > 4
            ? appliedCuts.editedDurationSec
            : Math.max(12, moment.endSec - moment.startSec),
        ),
      ),
    );
    const hookFrames = Math.max(90, Math.round(totalSec * 0.25 * fps));
    const valueFrames = Math.max(120, Math.round(totalSec * 0.55 * fps));
    const payoffFrames = Math.max(90, totalSec * fps - hookFrames - valueFrames);
    const totalFrames = hookFrames + valueFrames + payoffFrames;
    const transitionIn = mapMotionTransitionToSpec(motionPreset.defaultTransition);

    const narrationClean = cleanedSegments.map((s) => s.text).join(' ').trim() || moment.excerpt;
    const ctaText = `Follow for more ${project.name} insights`;

    const spec: CompositionSpec = CompositionSpecSchema.parse({
      schemaVersion: '1.0',
      templateId,
      width,
      height,
      fps,
      durationInFrames: totalFrames,
      brand: {
        primaryColor: brandKit?.primaryColor ?? '#6366F1',
        secondaryColor: brandKit?.secondaryColor ?? '#0F172A',
        accentColor: brandKit?.accentColor ?? '#22D3EE',
        headingFont: brandKit?.headingFont ?? 'Open Sans',
        bodyFont: brandKit?.bodyFont ?? 'Open Sans',
        ...(brandKit?.logoAssetId ? { logoAssetId: brandKit.logoAssetId } : {}),
      },
      captions: {
        enabled: true,
        style: mapCaptionAnimationToSpecStyle(
          resolvedCaptionPreset.animation,
          resolvedCaptionPreset.position,
        ),
        fontSizePx: Math.min(120, Math.max(20, resolvedCaptionPreset.fontSizePx)),
        highlightColor: resolvedCaptionPreset.highlightColor.slice(0, 7),
        safeBottomMarginPx: Math.min(400, Math.max(80, Math.min(360, resolvedCaptionPreset.marginV))),
      },
      audio: {
        musicVolume: 0.14,
        duckingEnabled: true,
      },
      scenes: [
        {
          id: `short-${idx + 1}-hook`,
          orderIndex: 0,
          startFrame: 0,
          durationInFrames: hookFrames,
          layout: 'talking-head',
          ...(moment.sourceAssetId ? { primaryAssetId: moment.sourceAssetId } : {}),
          trimStartSec: Math.max(0, moment.startSec),
          headlineText: moment.hook.slice(0, 90),
          narrationText: cleanedSegments[0]?.text ?? moment.hook,
          transitionIn,
          overlays: [
            {
              id: `ov-hook-${idx + 1}`,
              component: 'AnimatedHeadline',
              startOffsetFrames: 0,
              durationInFrames: hookFrames,
              props: {
                text: moment.hook.slice(0, 90),
                captionPresetId: resolvedCaptionPreset.id,
                motionPresetId: motionPreset.id,
                focalPoint,
              },
            },
          ],
        },
        {
          id: `short-${idx + 1}-value`,
          orderIndex: 1,
          startFrame: hookFrames,
          durationInFrames: valueFrames,
          layout: 'b-roll-overlay',
          ...(moment.sourceAssetId ? { primaryAssetId: moment.sourceAssetId } : {}),
          trimStartSec: Math.max(0, moment.startSec + Math.round(hookFrames / fps)),
          headlineText: `Key Insight #${idx + 1}`,
          narrationText: narrationClean.slice(0, 320),
          transitionIn,
          overlays: [
            {
              id: `ov-captions-${idx + 1}`,
              component: 'WordSyncedCaptions',
              startOffsetFrames: 0,
              durationInFrames: valueFrames,
              props: {
                captionPresetId: resolvedCaptionPreset.id,
                cueCount: captionBundle.cues.length,
                focalPoint,
              },
            },
            ...(motionPreset.showProgressBar
              ? [
                  {
                    id: `ov-progress-${idx + 1}`,
                    component: 'ProgressBar' as const,
                    startOffsetFrames: 0,
                    durationInFrames: valueFrames,
                    props: { style: motionPreset.lowerThirdStyle },
                  },
                ]
              : []),
          ],
        },
        {
          id: `short-${idx + 1}-cta`,
          orderIndex: 2,
          startFrame: hookFrames + valueFrames,
          durationInFrames: payoffFrames,
          layout: 'full-bleed',
          ...(moment.sourceAssetId ? { primaryAssetId: moment.sourceAssetId } : {}),
          trimStartSec: Math.max(0, moment.startSec + Math.round((hookFrames + valueFrames) / fps)),
          headlineText: ctaText,
          narrationText: ctaText,
          transitionIn,
          overlays: [
            {
              id: `ov-cta-${idx + 1}`,
              component: 'CallToActionScene',
              startOffsetFrames: 0,
              durationInFrames: payoffFrames,
              props: {
                cta: ctaText,
                motionPresetId: motionPreset.id,
              },
            },
          ],
        },
      ],
    });

    const creativeQa = evaluateCreativeShortQa({
      hook: moment.hook,
      scenes: spec.scenes.map((s) => ({
        id: s.id,
        heading: s.headlineText ?? '',
        body: s.narrationText,
        durationSec: s.durationInFrames / fps,
      })),
      captionPreset: resolvedCaptionPreset,
      segments: cleanedSegments,
      hasBrandKit: Boolean(brandKit),
      cta: ctaText,
      aspectRatio: input.aspectRatio,
    });

    const compositionId = randomUUID();
    const versionId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.composition.create({
        data: {
          id: compositionId,
          workspaceId,
          projectId: project.id,
          title: `Short #${idx + 1}: ${moment.title}`.slice(0, 120),
          targetPlatform: input.targetPlatform,
          aspectRatio: input.aspectRatio,
          width,
          height,
          fps,
          durationInFrames: totalFrames,
          currentVersionId: versionId,
        },
      });
      await tx.compositionVersion.create({
        data: {
          id: versionId,
          compositionId,
          versionNumber: 1,
          specJson: toJson(spec),
          changeSummary: `Generated by Shorts Factory (${resolvedCaptionPreset.name}, ${motionPreset.name}, SmartCut=${input.smartCutPreset})`,
          createdByType: 'USER',
        },
      });
    });

    let renderJobId: string | null = null;
    let assetId: string | null = null;
    let streamUrl: string | null = null;
    let downloadUrl: string | null = null;
    let signalQa: unknown = null;

    if (input.renderMp4) {
      const rendered = await renderAndInspectCompositionVersion({
        workspaceId,
        compositionId,
        compositionVersionId: versionId,
        ...(params.storage ? { storage: params.storage } : {}),
      });
      renderJobId = rendered.renderJob.id;
      assetId = rendered.renderJob.assetId;
      streamUrl = rendered.renderJob.streamUrl;
      downloadUrl = rendered.renderJob.downloadUrl;
      signalQa = rendered.renderJob.signalQa ?? null;
    }

    results.push({
      shortIndex: idx + 1,
      title: `Short #${idx + 1}: ${moment.title}`.slice(0, 120),
      hook: moment.hook,
      sourceAssetId: moment.sourceAssetId,
      sourceStartSec: moment.startSec,
      sourceEndSec: moment.endSec,
      compositionId,
      compositionVersionId: versionId,
      renderJobId,
      assetId,
      streamUrl,
      downloadUrl,
      captionPresetId: resolvedCaptionPreset.id,
      motionPresetId: motionPreset.id,
      smartCutSummary: {
        preset: input.smartCutPreset,
        originalDurationSec: appliedCuts.originalDurationSec,
        editedDurationSec: appliedCuts.editedDurationSec,
        savedSec: appliedCuts.savedSec,
        appliedCutCount: appliedCuts.appliedCutCount,
        protectedPauseCount: smartAnalysis.protectedPauseCount,
      },
      captionBundleSummary: {
        cueCount: captionBundle.cues.length,
        srtPreview: captionBundle.srtContent.slice(0, 400),
      },
      creativeQa,
      signalQa,
    });
  }

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: 'SHORTS_BATCH_GENERATED',
      entityType: 'Project',
      entityId: project.id,
      detailsJson: {
        shortsCount: results.length,
        captionPresetId: resolvedCaptionPreset.id,
        motionPresetId: motionPreset.id,
        smartCutPreset: input.smartCutPreset,
        aspectRatio: input.aspectRatio,
        renderedMp4: input.renderMp4,
      },
    },
  });

  return {
    projectId: project.id,
    captionPreset: resolvedCaptionPreset,
    motionPreset,
    rightsEvaluation,
    preflightCost,
    shortsCount: results.length,
    shorts: results,
    availableCaptionPresetsCount: CAPTION_PRESETS.length,
  };
}
