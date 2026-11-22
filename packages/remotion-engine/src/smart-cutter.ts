import type { SmartCutPreset, SmartCutProposal } from '@ai-content-os/shared';

export interface TimedTranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string | undefined;
}

export interface SmartCutInterval {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface SmartCutAnalysisResult {
  preset: SmartCutPreset;
  originalDurationSec: number;
  estimatedEditedDurationSec: number;
  estimatedSavedSec: number;
  protectedPauseCount: number;
  proposals: SmartCutProposal[];
}

export interface AppliedSmartCutsResult {
  originalDurationSec: number;
  editedDurationSec: number;
  savedSec: number;
  keptIntervals: SmartCutInterval[];
  cleanedSegments: TimedTranscriptSegment[];
  appliedCutCount: number;
  rejectedCutCount: number;
}

const SILENCE_THRESHOLDS_SEC: Record<SmartCutPreset, number> = {
  GENTLE: 1.8,
  BALANCED: 1.0,
  AGGRESSIVE: 0.55,
  MANUAL_REVIEW: 1.0,
};

const NATURAL_PAUSE_FLOOR_SEC = 0.45;
const RETAINED_BREATH_PAD_SEC = 0.16;

const FILLER_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string; confidence: number }> = [
  { pattern: /\b(um+|uh+|er+|ah+)\b/gi, label: 'vocal hesitation', confidence: 0.92 },
  { pattern: /\b(you know|i mean)\b/gi, label: 'conversational filler', confidence: 0.8 },
  { pattern: /\b(basically|literally)\b/gi, label: 'verbal filler', confidence: 0.72 },
  { pattern: /(?:^|,\s*)\blike\b(?=,|\s+(?:um|uh|the|a|i|we|they|it))/gi, label: 'filler "like"', confidence: 0.74 },
];

const FALSE_START_PATTERN = /\b([a-z]{2,})\s*[-–—]\s*\1\b|\b(we|i|they|it)\s+(was|were|is|are|can|will)\s*[-–—]\s*/i;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDramaticPauseContext(prevText: string): boolean {
  const trimmed = prevText.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?') || trimmed.endsWith('!')) return true;
  if (/\b(watch this|here is why|here's why|the truth is|listen closely|think about it|stop and look)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function computeWordOverlap(a: string, b: string): number {
  const tokensA = normalizePhrase(a).split(' ').filter((w) => w.length > 2);
  const tokensB = normalizePhrase(b).split(' ').filter((w) => w.length > 2);
  if (tokensA.length < 3 || tokensB.length < 3) return 0;
  const setA = new Set(tokensA);
  let overlap = 0;
  for (const w of tokensB) {
    if (setA.has(w)) overlap += 1;
  }
  return overlap / Math.min(tokensA.length, tokensB.length);
}

/**
 * Analyze timed transcript segments for non-destructive Smart Cut proposals.
 * Preserves short natural pauses (< 0.45s) and dramatic pauses after hooks/questions.
 * Never cuts mid-word or removes genuine emphasis.
 */
export function analyzeSmartCuts(
  rawSegments: readonly TimedTranscriptSegment[],
  preset: SmartCutPreset = 'BALANCED',
): SmartCutAnalysisResult {
  const segments = [...rawSegments]
    .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  if (segments.length === 0) {
    return {
      preset,
      originalDurationSec: 0,
      estimatedEditedDurationSec: 0,
      estimatedSavedSec: 0,
      protectedPauseCount: 0,
      proposals: [],
    };
  }

  const lastSegment = segments[segments.length - 1];
  const originalDurationSec = round2(lastSegment ? lastSegment.endSec : 0);
  const silenceThreshold = SILENCE_THRESHOLDS_SEC[preset];
  const autoAcceptByPreset = preset !== 'MANUAL_REVIEW';
  const proposals: SmartCutProposal[] = [];
  let protectedPauseCount = 0;
  let seq = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg) continue;

    // 1. Silence gap detection between consecutive segments
    if (i > 0) {
      const prev = segments[i - 1];
      if (prev) {
        const gapSec = round2(seg.startSec - prev.endSec);
        if (gapSec >= NATURAL_PAUSE_FLOOR_SEC && gapSec >= silenceThreshold) {
          const dramatic = isDramaticPauseContext(prev.text);
          const trimStart = round2(prev.endSec + RETAINED_BREATH_PAD_SEC);
          const trimEnd = round2(seg.startSec - RETAINED_BREATH_PAD_SEC);
          const trimDur = round2(trimEnd - trimStart);

          if (trimDur > 0.12) {
            if (dramatic) protectedPauseCount += 1;
            seq += 1;
            proposals.push({
              cutId: `cut-silence-${seq}`,
              kind: 'LONG_SILENCE',
              startSec: trimStart,
              endSec: trimEnd,
              durationSec: trimDur,
              text: `[Silence ${gapSec.toFixed(2)}s]`,
              confidence: dramatic ? 0.45 : 0.94,
              reason: dramatic
                ? `Protected dramatic pause (${gapSec.toFixed(2)}s) after question/emphasis beat — unchecked by default.`
                : `Dead air of ${gapSec.toFixed(2)}s exceeds ${preset} threshold (${silenceThreshold}s); retains ${(RETAINED_BREATH_PAD_SEC * 2).toFixed(2)}s natural breath.`,
              protectedDramaticPause: dramatic,
              accepted: autoAcceptByPreset && !dramatic,
            });
          }
        }
      }
    }

    // 2. Filler word detection (only trims standalone filler words or estimates clean word span)
    const segDur = Math.max(0.1, seg.endSec - seg.startSec);
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    for (const rule of FILLER_PATTERNS) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(seg.text);
      if (!match) continue;

      const matchedText = match[0].trim();
      const charRatio = Math.max(0, Math.min(0.95, match.index / Math.max(1, seg.text.length)));
      const wordShare = Math.min(0.6, Math.max(0.18, matchedText.split(/\s+/).length / Math.max(1, words.length)));
      const fillerStart = round2(seg.startSec + segDur * charRatio);
      const fillerDur = round2(Math.max(0.15, segDur * wordShare));
      const fillerEnd = round2(Math.min(seg.endSec, fillerStart + fillerDur));

      if (fillerEnd > fillerStart + 0.08) {
        seq += 1;
        const acceptFiller =
          autoAcceptByPreset &&
          (preset === 'AGGRESSIVE' || (preset === 'BALANCED' && rule.confidence >= 0.8));
        proposals.push({
          cutId: `cut-filler-${seq}`,
          kind: 'FILLER_WORD',
          startSec: fillerStart,
          endSec: fillerEnd,
          durationSec: round2(fillerEnd - fillerStart),
          text: matchedText,
          confidence: rule.confidence,
          reason: `Detected ${rule.label} ("${matchedText}") inside speech segment.`,
          protectedDramaticPause: false,
          accepted: acceptFiller,
        });
      }
      break;
    }

    // 3. False start detection
    if (FALSE_START_PATTERN.test(seg.text)) {
      seq += 1;
      const cutDur = round2(Math.min(segDur * 0.4, 0.9));
      if (cutDur > 0.12) {
        proposals.push({
          cutId: `cut-false-start-${seq}`,
          kind: 'FALSE_START',
          startSec: round2(seg.startSec),
          endSec: round2(seg.startSec + cutDur),
          durationSec: cutDur,
          text: seg.text.slice(0, 48),
          confidence: 0.78,
          reason: 'Detected stumbled false start with immediate self-correction.',
          protectedDramaticPause: false,
          accepted: autoAcceptByPreset && preset !== 'GENTLE',
        });
      }
    }

    // 4. Adjacent repeated phrase / retake detection (only when previous take is clearly superseded)
    if (i > 0) {
      const prev = segments[i - 1];
      if (prev) {
        const overlap = computeWordOverlap(prev.text, seg.text);
        const gap = seg.startSec - prev.endSec;
        if (overlap >= 0.75 && gap <= 3.0 && prev.text.trim().length >= 12) {
          const prevDur = round2(prev.endSec - prev.startSec);
          if (prevDur > 0.25) {
            seq += 1;
            proposals.push({
              cutId: `cut-retake-${seq}`,
              kind: 'REPEATED_PHRASE',
              startSec: round2(prev.startSec),
              endSec: round2(prev.endSec),
              durationSec: prevDur,
              text: prev.text.trim(),
              confidence: round2(Math.min(0.95, 0.65 + overlap * 0.3)),
              reason: `Earlier take overlaps ${Math.round(overlap * 100)}% with immediate retake; keeping cleaner second take.`,
              protectedDramaticPause: false,
              accepted: autoAcceptByPreset && preset !== 'GENTLE',
            });
          }
        }
      }
    }
  }

  const savedSec = round2(
    proposals
      .filter((p) => p.accepted)
      .reduce((acc, p) => acc + p.durationSec, 0),
  );
  const estimatedEditedDurationSec = round2(Math.max(0, originalDurationSec - savedSec));

  return {
    preset,
    originalDurationSec,
    estimatedEditedDurationSec,
    estimatedSavedSec: savedSec,
    protectedPauseCount,
    proposals,
  };
}

/**
 * Apply user-approved Smart Cut proposals non-destructively, returning kept timeline intervals
 * and cleaned transcript segments with remapped timestamps.
 */
export function applySmartCutDecisions(
  rawSegments: readonly TimedTranscriptSegment[],
  proposals: readonly SmartCutProposal[],
): AppliedSmartCutsResult {
  const segments = [...rawSegments]
    .filter((s) => s.endSec > s.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const lastSeg = segments[segments.length - 1];
  const originalDurationSec = round2(lastSeg ? lastSeg.endSec : 0);

  const accepted = proposals
    .filter((p) => p.accepted && p.endSec > p.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  // Merge overlapping accepted cut intervals
  const mergedCuts: SmartCutInterval[] = [];
  for (const cut of accepted) {
    const prev = mergedCuts[mergedCuts.length - 1];
    if (prev && cut.startSec <= prev.endSec) {
      prev.endSec = Math.max(prev.endSec, cut.endSec);
      prev.durationSec = round2(prev.endSec - prev.startSec);
    } else {
      mergedCuts.push({
        startSec: cut.startSec,
        endSec: cut.endSec,
        durationSec: round2(cut.endSec - cut.startSec),
      });
    }
  }

  // Compute kept timeline intervals
  const keptIntervals: SmartCutInterval[] = [];
  let cursor = 0;
  for (const cut of mergedCuts) {
    if (cut.startSec > cursor + 0.05) {
      keptIntervals.push({
        startSec: round2(cursor),
        endSec: round2(cut.startSec),
        durationSec: round2(cut.startSec - cursor),
      });
    }
    cursor = Math.max(cursor, cut.endSec);
  }
  if (originalDurationSec > cursor + 0.05) {
    keptIntervals.push({
      startSec: round2(cursor),
      endSec: originalDurationSec,
      durationSec: round2(originalDurationSec - cursor),
    });
  }

  const savedSec = round2(mergedCuts.reduce((acc, c) => acc + c.durationSec, 0));
  const editedDurationSec = round2(Math.max(0, originalDurationSec - savedSec));

  // Build cleaned segments excluding fully cut retakes and stripping accepted filler words
  const fullCutRanges = accepted.filter((c) => c.kind === 'REPEATED_PHRASE');
  const fillerCuts = accepted.filter((c) => c.kind === 'FILLER_WORD');
  let cumulativeShift = 0;
  let cutIdx = 0;

  const cleanedSegments: TimedTranscriptSegment[] = [];
  for (const seg of segments) {
    const isDroppedTake = fullCutRanges.some(
      (c) => Math.abs(c.startSec - seg.startSec) < 0.08 && Math.abs(c.endSec - seg.endSec) < 0.08,
    );
    if (isDroppedTake) continue;

    while (cutIdx < mergedCuts.length) {
      const mc = mergedCuts[cutIdx];
      if (!mc || mc.endSec > seg.startSec) break;
      cumulativeShift += mc.durationSec;
      cutIdx += 1;
    }

    let cleanedText = seg.text;
    for (const fc of fillerCuts) {
      if (fc.startSec >= seg.startSec - 0.05 && fc.endSec <= seg.endSec + 0.05) {
        const escaped = fc.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleanedText = cleanedText.replace(new RegExp(`\\b${escaped}\\b[,\\s]*`, 'i'), ' ').replace(/\s+/g, ' ').trim();
      }
    }

    if (!cleanedText) continue;
    const newStart = round2(Math.max(0, seg.startSec - cumulativeShift));
    const newEnd = round2(Math.max(newStart + 0.2, seg.endSec - cumulativeShift));
    cleanedSegments.push({
      startSec: newStart,
      endSec: newEnd,
      text: cleanedText,
      ...(seg.speaker ? { speaker: seg.speaker } : {}),
    });
  }

  return {
    originalDurationSec,
    editedDurationSec,
    savedSec,
    keptIntervals,
    cleanedSegments,
    appliedCutCount: accepted.length,
    rejectedCutCount: proposals.length - accepted.length,
  };
}
