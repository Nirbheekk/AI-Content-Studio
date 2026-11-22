import { describe, expect, it } from 'vitest';
import { CAPTION_PRESETS } from '@ai-content-os/shared';
import {
  analyzeSmartCuts,
  applySmartCutDecisions,
  buildStyledAssFromSegments,
  evaluateCreativeShortQa,
  resolveCaptionPreset,
  type TimedTranscriptSegment,
} from '../index.js';

const SAMPLE_SEGMENTS: TimedTranscriptSegment[] = [
  { startSec: 0, endSec: 2.4, text: 'Why do most AI videos fail in three seconds?' },
  // 1.5s dramatic pause right after a question — must be protected!
  { startSec: 3.9, endSec: 6.5, text: 'Um, because creators skip the visual proof.' },
  // 0.3s short natural pause — must NEVER be proposed for cutting
  { startSec: 6.8, endSec: 9.2, text: 'Our studio renders deterministic clips fast.' },
  // 2.2s dead air silence — should be proposed & accepted in BALANCED
  { startSec: 11.4, endSec: 14.0, text: 'We cut production time by seventy percent.' },
  // Immediate retake of previous line — should be proposed as REPEATED_PHRASE
  { startSec: 14.4, endSec: 17.2, text: 'We cut production time by seventy percent today.' },
];

describe('Stage 4 — Professional Shorts Engine (Smart Cutter, Captions, Creative QA)', () => {
  it('detects dead air, filler words, and retakes while protecting natural & dramatic pauses', () => {
    const analysis = analyzeSmartCuts(SAMPLE_SEGMENTS, 'BALANCED');

    expect(analysis.originalDurationSec).toBe(17.2);
    expect(analysis.protectedPauseCount).toBe(1);

    const dramaticPause = analysis.proposals.find((p) => p.protectedDramaticPause);
    expect(dramaticPause).toBeDefined();
    expect(dramaticPause?.accepted).toBe(false);

    // 0.3s natural pause between 6.5s and 6.8s must NOT be cut
    const naturalPauseCut = analysis.proposals.find(
      (p) => p.kind === 'LONG_SILENCE' && p.startSec >= 6.4 && p.endSec <= 6.9,
    );
    expect(naturalPauseCut).toBeUndefined();

    // 2.2s dead air between 9.2s and 11.4s MUST be proposed and accepted
    const deadAirCut = analysis.proposals.find(
      (p) => p.kind === 'LONG_SILENCE' && !p.protectedDramaticPause,
    );
    expect(deadAirCut).toBeDefined();
    expect(deadAirCut?.accepted).toBe(true);

    // Filler word "Um" detected and accepted
    const fillerCut = analysis.proposals.find((p) => p.kind === 'FILLER_WORD');
    expect(fillerCut).toBeDefined();
    expect(fillerCut?.accepted).toBe(true);

    // Adjacent retake detected
    const retakeCut = analysis.proposals.find((p) => p.kind === 'REPEATED_PHRASE');
    expect(retakeCut).toBeDefined();
    expect(retakeCut?.accepted).toBe(true);
  });

  it('respects MANUAL_REVIEW preset and applies manual accept/reject non-destructively', () => {
    const manual = analyzeSmartCuts(SAMPLE_SEGMENTS, 'MANUAL_REVIEW');
    expect(manual.proposals.length).toBeGreaterThan(0);
    expect(manual.proposals.every((p) => !p.accepted)).toBe(true);
    expect(manual.estimatedSavedSec).toBe(0);

    // Accept only the first non-dramatic cut
    const overridden = manual.proposals.map((p, idx) =>
      idx === manual.proposals.length - 1 ? { ...p, accepted: true } : p,
    );
    const applied = applySmartCutDecisions(SAMPLE_SEGMENTS, overridden);
    expect(applied.appliedCutCount).toBe(1);
    expect(applied.savedSec).toBeGreaterThan(0);
    expect(applied.editedDurationSec).toBeLessThan(applied.originalDurationSec);
    expect(applied.keptIntervals.length).toBeGreaterThan(0);
  });

  it('generates valid ASS, SRT, and VTT bundles for all 8 caption presets including Brand Custom', () => {
    expect(CAPTION_PRESETS).toHaveLength(8);

    for (const presetSpec of CAPTION_PRESETS) {
      const resolved = resolveCaptionPreset(presetSpec.id, {
        primaryColor: '#FF3366',
        accentColor: '#00FFAA',
        secondaryColor: '#101018',
        fontHeading: 'Montserrat',
      });

      if (presetSpec.id === 'brand-custom') {
        expect(resolved.fontFamily).toBe('Montserrat');
        expect(resolved.highlightColor).toBe('#00FFAA');
      }

      const bundle = buildStyledAssFromSegments(SAMPLE_SEGMENTS, resolved);
      expect(bundle.cues.length).toBeGreaterThan(0);
      expect(bundle.assContent).toContain('[V4+ Styles]');
      expect(bundle.assContent).toContain('Dialogue:');
      expect(bundle.srtContent).toContain('-->');
      expect(bundle.vttContent.startsWith('WEBVTT')).toBe(true);
    }
  });

  it('evaluates Creative QA separately from technical QA and flags weak hooks or missing brand kit', () => {
    const goodPreset = resolveCaptionPreset('bold-creator');
    const strongReport = evaluateCreativeShortQa({
      hook: 'Why 90% of AI Shorts Lose Viewers in 3 Seconds',
      scenes: [
        { id: 's1', heading: 'The 3-Second Hook Problem', body: 'Viewers leave when proof arrives late.', durationSec: 5 },
        { id: 's2', heading: 'Deterministic Proof First', body: 'Show the real transformation right away.', durationSec: 12 },
        { id: 's3', heading: 'Follow for More Systems', body: 'Save this workflow for your next launch.', durationSec: 5 },
      ],
      captionPreset: goodPreset,
      segments: SAMPLE_SEGMENTS,
      hasBrandKit: true,
      cta: 'Follow for more workflows',
      aspectRatio: 'PORTRAIT_9_16',
    });

    expect(strongReport.passed).toBe(true);
    expect(strongReport.score).toBe(100);
    expect(strongReport.recommendations).toHaveLength(0);

    const weakReport = evaluateCreativeShortQa({
      hook: 'Hi',
      scenes: [{ id: 's1', heading: 'Only One Scene', body: 'Short', durationSec: 3 }],
      captionPreset: { ...goodPreset, marginV: 60 },
      segments: [],
      hasBrandKit: false,
      cta: '',
      aspectRatio: 'PORTRAIT_9_16',
    });

    expect(weakReport.passed).toBe(false);
    expect(weakReport.score).toBeLessThan(60);
    expect(weakReport.recommendations.length).toBeGreaterThanOrEqual(4);
  });
});
