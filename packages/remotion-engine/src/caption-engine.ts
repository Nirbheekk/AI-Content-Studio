import {
  CAPTION_PRESETS,
  type CaptionPresetId,
  type CaptionPresetSpec,
} from '@ai-content-os/shared';
import type { TimedTranscriptSegment } from './smart-cutter.js';

export interface BrandKitCaptionOverrides {
  primaryColor?: string | null | undefined;
  secondaryColor?: string | null | undefined;
  accentColor?: string | null | undefined;
  fontHeading?: string | null | undefined;
}

export interface TimedCaptionCue {
  index: number;
  startSec: number;
  endSec: number;
  lines: string[];
  text: string;
}

export interface GeneratedCaptionBundle {
  preset: CaptionPresetSpec;
  cues: TimedCaptionCue[];
  assContent: string;
  srtContent: string;
  vttContent: string;
}

/**
 * Resolve any of the 8 supported caption presets and optionally inject Brand Kit overrides.
 */
export function resolveCaptionPreset(
  presetId: CaptionPresetId = 'bold-creator',
  brandKit?: BrandKitCaptionOverrides | null,
): CaptionPresetSpec {
  const found =
    CAPTION_PRESETS.find((p) => p.id === presetId) ?? CAPTION_PRESETS[1]!;

  if (presetId !== 'brand-custom' || !brandKit) {
    return { ...found };
  }

  return {
    ...found,
    fontFamily: brandKit.fontHeading?.trim() || found.fontFamily,
    highlightColor: brandKit.accentColor?.trim() || brandKit.primaryColor?.trim() || found.highlightColor,
    outlineColor: brandKit.secondaryColor?.trim() || found.outlineColor,
  };
}

/**
 * Convert #RRGGBB or #RRGGBBAA into ASS &HAABBGGRR format.
 */
function hexToAssColor(hex: string, fallback = '&H00FFFFFF'): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = clean.slice(0, 2).toUpperCase();
    const g = clean.slice(2, 4).toUpperCase();
    const b = clean.slice(4, 6).toUpperCase();
    return `&H00${b}${g}${r}`;
  }
  if (clean.length === 8) {
    const r = clean.slice(0, 2).toUpperCase();
    const g = clean.slice(2, 4).toUpperCase();
    const b = clean.slice(4, 6).toUpperCase();
    const alphaOpacity = parseInt(clean.slice(6, 8), 16);
    const assAlpha = Number.isFinite(alphaOpacity)
      ? (255 - alphaOpacity).toString(16).padStart(2, '0').toUpperCase()
      : '80';
    return `&H${assAlpha}${b}${g}${r}`;
  }
  return fallback;
}

function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const centis = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.floor((clamped - Math.floor(clamped)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function formatVttTime(sec: number): string {
  return formatSrtTime(sec).replace(',', '.');
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/**
 * Wrap caption words respecting maxWordsPerLine and maxLines without inventing words.
 */
function chunkWordsIntoCues(
  segments: readonly TimedTranscriptSegment[],
  preset: CaptionPresetSpec,
): TimedCaptionCue[] {
  const maxWordsPerCue = Math.max(1, preset.maxWordsPerLine * preset.maxLines);
  const cues: TimedCaptionCue[] = [];
  let cueIndex = 0;

  for (const seg of segments) {
    const rawText = seg.text.trim();
    if (!rawText || seg.endSec <= seg.startSec) continue;

    const words = rawText.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const totalChunks = Math.ceil(words.length / maxWordsPerCue);
    const segDur = seg.endSec - seg.startSec;

    for (let c = 0; c < totalChunks; c += 1) {
      const slice = words.slice(c * maxWordsPerCue, (c + 1) * maxWordsPerCue);
      if (slice.length === 0) continue;

      const chunkStart = seg.startSec + (segDur * c) / totalChunks;
      const chunkEnd = seg.startSec + (segDur * (c + 1)) / totalChunks;
      const displayWords = preset.uppercase ? slice.map((w) => w.toUpperCase()) : slice;

      const lines: string[] = [];
      for (let l = 0; l < displayWords.length; l += preset.maxWordsPerLine) {
        lines.push(displayWords.slice(l, l + preset.maxWordsPerLine).join(' '));
      }

      cueIndex += 1;
      cues.push({
        index: cueIndex,
        startSec: Math.round(chunkStart * 1000) / 1000,
        endSec: Math.round(Math.max(chunkStart + 0.15, chunkEnd) * 1000) / 1000,
        lines,
        text: lines.join('\n'),
      });
    }
  }

  return cues;
}

/**
 * Generate an ASS v4+ subtitle script with karaoke/word-pop/fade animation, safe-zone marginV,
 * and accurate timing aligned to the source transcript segments.
 */
export function buildStyledAssFromSegments(
  segments: readonly TimedTranscriptSegment[],
  preset: CaptionPresetSpec,
  width = 1080,
  height = 1920,
): GeneratedCaptionBundle {
  const cues = chunkWordsIntoCues(segments, preset);

  const primaryAss = hexToAssColor(preset.highlightColor, '&H0000E6FF');
  const secondaryAss = hexToAssColor(preset.primaryColor, '&H00FFFFFF');
  const outlineAss = hexToAssColor(preset.outlineColor, '&H00000000');
  const backAss = hexToAssColor(preset.backgroundColor, '&H80000000');
  const boldFlag = preset.fontWeight === 'bold' ? -1 : 0;
  const alignment = preset.position === 'upper-third' ? 8 : 2;
  const scaledMarginV = Math.round((preset.marginV / 1920) * height);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ShortsCaption,${preset.fontFamily},${preset.fontSizePx},${primaryAss},${secondaryAss},${outlineAss},${backAss},${boldFlag},0,0,0,100,100,0,0,1,${preset.outlinePx},${preset.shadowPx},${alignment},64,64,${scaledMarginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events: string[] = [];
  for (const cue of cues) {
    const start = formatAssTime(cue.startSec);
    const end = formatAssTime(cue.endSec);
    const totalCs = Math.max(10, Math.round((cue.endSec - cue.startSec) * 100));

    let body: string;
    if (preset.animation === 'karaoke-fill' || preset.animation === 'word-pop') {
      const renderedLines = cue.lines.map((line) => {
        const lineWords = line.split(/\s+/).filter(Boolean);
        const perWordCs = Math.max(5, Math.floor(totalCs / Math.max(1, cue.lines.join(' ').split(/\s+/).length)));
        return lineWords
          .map((w) => {
            const safe = escapeAssText(w);
            if (preset.animation === 'word-pop') {
              return `{\\kf${perWordCs}\\t(0,90,\\fscx112\\fscy112)\\t(90,180,\\fscx100\\fscy100)}${safe}`;
            }
            return `{\\kf${perWordCs}}${safe}`;
          })
          .join(' ');
      });
      body = renderedLines.join('\\N');
    } else if (preset.animation === 'fade-slide') {
      body = `{\\fad(120,120)}${cue.lines.map(escapeAssText).join('\\N')}`;
    } else {
      body = cue.lines.map(escapeAssText).join('\\N');
    }

    events.push(`Dialogue: 0,${start},${end},ShortsCaption,,0,0,0,,${body}`);
  }

  return {
    preset,
    cues,
    assContent: [...header, ...events, ''].join('\n'),
    srtContent: exportTimedSrt(cues),
    vttContent: exportTimedVtt(cues),
  };
}

export function exportTimedSrt(cues: readonly TimedCaptionCue[]): string {
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}\n`,
    )
    .join('\n');
}

export function exportTimedVtt(cues: readonly TimedCaptionCue[]): string {
  const body = cues
    .map(
      (cue) =>
        `${formatVttTime(cue.startSec)} --> ${formatVttTime(cue.endSec)}\n${cue.text}\n`,
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
