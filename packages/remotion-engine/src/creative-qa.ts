import type {
  CaptionPresetSpec,
  CreativeQaCheck,
  CreativeQaReport,
} from '@ai-content-os/shared';
import type { TimedTranscriptSegment } from './smart-cutter.js';

export interface CreativeShortQaInput {
  hook: string;
  scenes: ReadonlyArray<{
    id: string;
    heading: string;
    body?: string | undefined;
    durationSec: number;
  }>;
  captionPreset: CaptionPresetSpec;
  segments: readonly TimedTranscriptSegment[];
  hasBrandKit: boolean;
  cta?: string | undefined;
  aspectRatio: 'PORTRAIT_9_16' | 'PORTRAIT_4_5' | 'SQUARE_1_1' | 'LANDSCAPE_16_9';
}

/**
 * Evaluate editorial & creative quality of a generated Short.
 * Explicitly separated from FFmpeg technical Signal QA (black frames, silence, LUFS).
 */
export function evaluateCreativeShortQa(input: CreativeShortQaInput): CreativeQaReport {
  const checks: CreativeQaCheck[] = [];

  // 1. Hook clarity & punchiness (<= 14 words, >= 3 words)
  const hookWords = input.hook.trim().split(/\s+/).filter(Boolean);
  const hookOk = hookWords.length >= 3 && hookWords.length <= 14;
  checks.push({
    checkId: 'hook-clarity',
    passed: hookOk,
    measuredValue: `${hookWords.length} words`,
    recommendation: hookOk
      ? null
      : 'Tighten the opening hook to 3–14 punchy words so viewers grasp the premise within 2 seconds.',
  });

  // 2. Context preservation (has complete thought / non-empty transcript or scene body)
  const totalSpokenWords = input.segments
    .map((s) => s.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const totalSceneWords = input.scenes
    .map((s) => `${s.heading} ${s.body ?? ''}`)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const effectiveWords = Math.max(totalSpokenWords, totalSceneWords);
  const contextOk = effectiveWords >= 12;
  checks.push({
    checkId: 'context-preservation',
    passed: contextOk,
    measuredValue: `${effectiveWords} words`,
    recommendation: contextOk
      ? null
      : 'Expand clip boundaries slightly so the premise and payoff form a self-contained story.',
  });

  // 3. Caption safe-zone compliance (marginV >= 180 on vertical shorts to clear platform UI chrome)
  const safeZoneOk =
    input.aspectRatio !== 'PORTRAIT_9_16' || input.captionPreset.marginV >= 180;
  checks.push({
    checkId: 'caption-safe-zone',
    passed: safeZoneOk,
    measuredValue: `marginV=${input.captionPreset.marginV}px (${input.captionPreset.position})`,
    recommendation: safeZoneOk
      ? null
      : 'Raise caption vertical margin to at least 180px so Reels/TikTok/Shorts UI overlays do not cover text.',
  });

  // 4. Caption readability (maxLines <= 2 and maxWordsPerLine <= 7)
  const readableOk =
    input.captionPreset.maxLines <= 2 && input.captionPreset.maxWordsPerLine <= 7;
  checks.push({
    checkId: 'caption-readability',
    passed: readableOk,
    measuredValue: `${input.captionPreset.maxLines} lines × ${input.captionPreset.maxWordsPerLine} words/line`,
    recommendation: readableOk
      ? null
      : 'Limit captions to 1–2 short lines with <= 7 words per line for mobile readability.',
  });

  // 5. Visual rhythm & scene structure (at least 3 scenes for Shorts pacing)
  const sceneCount = input.scenes.length;
  const rhythmOk = sceneCount >= 3;
  checks.push({
    checkId: 'visual-rhythm',
    passed: rhythmOk,
    measuredValue: `${sceneCount} scenes`,
    recommendation: rhythmOk
      ? null
      : 'Structure the Short into at least 3 distinct visual beats (Hook, Value/Evidence, Payoff/CTA).',
  });

  // 6. Target short duration pacing (8s–65s)
  const totalDurationSec = input.scenes.reduce((acc, s) => acc + s.durationSec, 0);
  const durationOk = totalDurationSec >= 8 && totalDurationSec <= 65;
  checks.push({
    checkId: 'short-duration-pacing',
    passed: durationOk,
    measuredValue: `${Math.round(totalDurationSec * 10) / 10}s`,
    recommendation: durationOk
      ? null
      : 'Keep short-form runtime between 8s and 65s for optimal Reels/TikTok/Shorts retention.',
  });

  // 7. Brand consistency
  checks.push({
    checkId: 'brand-consistency',
    passed: input.hasBrandKit,
    measuredValue: input.hasBrandKit ? 'Brand Kit applied' : 'Default styling',
    recommendation: input.hasBrandKit
      ? null
      : 'Attach a workspace Brand Kit to enforce brand typography, palette, and watermark consistency.',
  });

  // 8. Non-repetition across scenes
  const headings = input.scenes.map((s) => s.heading.trim().toLowerCase()).filter(Boolean);
  const uniqueHeadings = new Set(headings);
  const nonRepetitiveOk = headings.length === 0 || uniqueHeadings.size === headings.length;
  checks.push({
    checkId: 'non-repetition',
    passed: nonRepetitiveOk,
    measuredValue: `${uniqueHeadings.size}/${headings.length} unique headings`,
    recommendation: nonRepetitiveOk
      ? null
      : 'Differentiate scene headings so each beat introduces new visual or editorial value.',
  });

  // 9. Call-to-action / closing payoff presence
  const ctaText = (input.cta ?? input.scenes[input.scenes.length - 1]?.heading ?? '').trim();
  const ctaOk = ctaText.length >= 4;
  checks.push({
    checkId: 'closing-payoff',
    passed: ctaOk,
    measuredValue: ctaOk ? `"${ctaText.slice(0, 42)}"` : 'Missing',
    recommendation: ctaOk
      ? null
      : 'Add a clear closing takeaway or call-to-action on the final beat.',
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const recommendations = checks
    .map((c) => c.recommendation)
    .filter((r): r is string => r !== null);

  return {
    passed: score >= 75,
    score,
    note: 'Creative QA evaluates editorial hook, caption readability, safe zones, pacing, and brand alignment (separate from FFmpeg technical Signal QA).',
    checks,
    recommendations,
  };
}
