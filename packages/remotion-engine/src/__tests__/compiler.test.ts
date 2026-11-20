import { describe, expect, it } from 'vitest';
import {
  applyCompositionPatches,
  CompositionSpec,
  detectMimeTypeFromMagicBytes,
} from '@ai-content-os/shared';
import {
  compileCompositionSpec,
  evaluateFrameAt,
  inspectCompositionAndFrames,
  PLATFORM_TEMPLATES,
  REMOTION_COMPONENT_LIBRARY,
  renderInspectionFramePng,
  synthesizeMp4Artifact,
} from '../index.js';

const baseSpec: CompositionSpec = {
  schemaVersion: '1.0',
  templateId: 'instagram-reel',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 270,
  brand: {
    primaryColor: '#6366F1',
    secondaryColor: '#09090B',
    accentColor: '#22D3EE',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
  captions: {
    enabled: true,
    style: 'word-highlight',
    fontSizePx: 54,
    highlightColor: '#22D3EE',
    safeBottomMarginPx: 220,
  },
  audio: {
    musicVolume: 0.15,
    duckingEnabled: true,
  },
  scenes: [
    {
      id: 'scene-1',
      orderIndex: 0,
      startFrame: 0,
      durationInFrames: 90,
      layout: 'talking-head',
      trimStartSec: 0,
      headlineText: '3-Second Hook Headline',
      narrationText: 'Most video workflows fail in the first three seconds.',
      transitionIn: 'zoom-punch',
      overlays: [
        {
          id: 'ov-1',
          component: 'AnimatedHeadline',
          startOffsetFrames: 0,
          durationInFrames: 90,
          props: { text: '3-Second Hook Headline' },
        },
      ],
    },
    {
      id: 'scene-2',
      orderIndex: 1,
      startFrame: 90,
      durationInFrames: 180,
      layout: 'podcast-split',
      trimStartSec: 2,
      headlineText: 'Autonomous Remotion Pipeline',
      narrationText: 'Compile validated JSON specifications into dynamic video sequences.',
      transitionIn: 'spring-slide',
      overlays: [
        {
          id: 'ov-2',
          component: 'WordSyncedCaptions',
          startOffsetFrames: 0,
          durationInFrames: 180,
          props: {},
        },
      ],
    },
  ],
};

describe('@ai-content-os/remotion-engine', () => {
  it('exposes all 9 platform templates and 16 reusable motion design components', () => {
    expect(Object.keys(PLATFORM_TEMPLATES)).toHaveLength(9);
    expect(Object.keys(REMOTION_COMPONENT_LIBRARY)).toHaveLength(16);
  });

  it('compiles CompositionSpec AST, evaluates frame states, and renders valid PNG frames and MP4 video', () => {
    const compiled = compileCompositionSpec(baseSpec);
    expect(compiled.sequences).toHaveLength(2);
    expect(compiled.totalDurationSec).toBe(9);

    const frame30 = evaluateFrameAt(compiled, 30);
    expect(frame30.activeSceneId).toBe('scene-1');
    expect(frame30.activeCaptionWord).toBeTruthy();
    expect(frame30.springScale).toBeGreaterThan(0.5);

    const { pngBytes } = renderInspectionFramePng(compiled, 30);
    expect(detectMimeTypeFromMagicBytes(pngBytes)).toBe('image/png');

    const mp4Bytes = synthesizeMp4Artifact(compiled);
    expect(detectMimeTypeFromMagicBytes(mp4Bytes)).toBe('video/mp4');
  });

  it('detects visual QA defects (overflow, safe-zone violation, empty frame) and auto-patches them to pass', () => {
    const defectiveSpec: CompositionSpec = {
      ...baseSpec,
      captions: {
        ...baseSpec.captions,
        fontSizePx: 108, // Overflow (>84)
        safeBottomMarginPx: 90, // Safe-zone violation (<220 for instagram-reel)
      },
      scenes: [
        {
          id: 'scene-defective',
          orderIndex: 0,
          startFrame: 0,
          durationInFrames: 90,
          layout: 'talking-head',
          trimStartSec: 0,
          headlineText: '',
          narrationText: '',
          transitionIn: 'fade',
          overlays: [],
        },
      ],
    };

    const firstQa = inspectCompositionAndFrames(defectiveSpec);
    expect(firstQa.passed).toBe(false);
    expect(firstQa.defects.length).toBeGreaterThanOrEqual(3);
    expect(firstQa.patchInstructions.length).toBeGreaterThanOrEqual(3);

    // Apply the QA agent's automated patch instructions
    const repairedSpec = applyCompositionPatches(defectiveSpec, firstQa.patchInstructions);
    const secondQa = inspectCompositionAndFrames(repairedSpec);
    expect(secondQa.passed).toBe(true);
    expect(secondQa.overallScore).toBe(100);
    expect(secondQa.defects).toHaveLength(0);
  });
});
