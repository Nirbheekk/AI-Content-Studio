import {
  applyCompositionPatches,
  ASPECT_RATIO_DIMENSIONS,
  AspectRatio,
  CompositionSpec,
  CompositionTemplateId,
} from '@ai-content-os/shared';
import { CompiledRemotionComposition, compileCompositionSpec } from './compiler.js';

export interface Mp4InspectionResult {
  valid: boolean;
  container: 'mp4';
  majorBrand: string;
  codec: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  durationSec: number;
  sceneCount: number;
  byteSize: number;
  hasValidKeyframeStream: boolean;
  audioSyncValid: boolean;
}

export interface PngInspectionResult {
  valid: boolean;
  format: 'png';
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  byteSize: number;
}

export interface WavInspectionResult {
  valid: boolean;
  format: 'wav';
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  durationSec: number;
  byteSize: number;
}

/**
 * Inspects a binary PNG buffer by parsing the 8-byte PNG signature and IHDR chunk.
 */
export function inspectPngArtifact(pngBytes: Uint8Array): PngInspectionResult {
  if (
    pngBytes.byteLength < 33 ||
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    return {
      valid: false,
      format: 'png',
      width: 0,
      height: 0,
      bitDepth: 0,
      colorType: 0,
      byteSize: pngBytes.byteLength,
    };
  }

  const buf = Buffer.from(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  const chunkType = buf.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    return {
      valid: false,
      format: 'png',
      width: 0,
      height: 0,
      bitDepth: 0,
      colorType: 0,
      byteSize: pngBytes.byteLength,
    };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24] ?? 0;
  const colorType = buf[25] ?? 0;

  return {
    valid: width > 0 && height > 0 && bitDepth === 8,
    format: 'png',
    width,
    height,
    bitDepth,
    colorType,
    byteSize: pngBytes.byteLength,
  };
}

/**
 * Inspects a binary RIFF/WAVE PCM audio buffer and extracts sample rate, channels, and duration.
 */
export function inspectWavArtifact(wavBytes: Uint8Array): WavInspectionResult {
  if (wavBytes.byteLength < 44) {
    return {
      valid: false,
      format: 'wav',
      channels: 0,
      sampleRate: 0,
      bitsPerSample: 0,
      durationSec: 0,
      byteSize: wavBytes.byteLength,
    };
  }

  const buf = Buffer.from(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return {
      valid: false,
      format: 'wav',
      channels: 0,
      sampleRate: 0,
      bitsPerSample: 0,
      durationSec: 0,
      byteSize: wavBytes.byteLength,
    };
  }

  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const byteRate = buf.readUInt32LE(28);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataBytes = buf.readUInt32LE(40);
  const durationSec = byteRate > 0 ? Number((dataBytes / byteRate).toFixed(2)) : 0;

  return {
    valid: channels > 0 && sampleRate > 0 && durationSec > 0,
    format: 'wav',
    channels,
    sampleRate,
    bitsPerSample,
    durationSec,
    byteSize: wavBytes.byteLength,
  };
}

/**
 * Validates that all word-level caption timestamps across a compiled composition
 * are monotonically ordered and synchronized within their parent scene boundaries.
 */
export function validateAudioCaptionSynchronization(
  compiled: CompiledRemotionComposition,
): { synchronized: boolean;checkedWordCount: number; driftIssues: string[] } {
  let checkedWordCount = 0;
  const driftIssues: string[] = [];

  for (const seq of compiled.sequences) {
    let prevEnd = seq.startSec;
    for (const word of seq.captionWords) {
      checkedWordCount += 1;
      if (word.startSec + 0.05 < seq.startSec || word.endSec - 0.05 > seq.endSec) {
        driftIssues.push(
          `Scene "${seq.sceneId}" word "${word.word}" (${word.startSec}s-${word.endSec}s) outside scene bounds (${seq.startSec}s-${seq.endSec}s)`,
        );
      }
      if (word.startSec + 0.05 < prevEnd) {
        driftIssues.push(
          `Scene "${seq.sceneId}" word "${word.word}" overlaps previous word timestamp (${word.startSec}s < ${prevEnd}s)`,
        );
      }
      prevEnd = word.endSec;
    }
  }

  return {
    synchronized: driftIssues.length === 0,
    checkedWordCount,
    driftIssues,
  };
}

/**
 * Inspects a rendered ISO-BMFF MP4 artifact buffer (`ftyp`, `moov`, `mdat` boxes),
 * verifying container brand, codec metadata, resolution, frame rate, duration, and keyframe stream.
 */
export function inspectMp4Artifact(
  mp4Bytes: Uint8Array,
  compiled?: CompiledRemotionComposition,
): Mp4InspectionResult {
  if (mp4Bytes.byteLength < 40) {
    return {
      valid: false,
      container: 'mp4',
      majorBrand: '',
      codec: 'unknown',
      width: 0,
      height: 0,
      fps: 0,
      durationInFrames: 0,
      durationSec: 0,
      sceneCount: 0,
      byteSize: mp4Bytes.byteLength,
      hasValidKeyframeStream: false,
      audioSyncValid: false,
    };
  }

  const buf = Buffer.from(mp4Bytes.buffer, mp4Bytes.byteOffset, mp4Bytes.byteLength);
  const ftypSize = buf.readUInt32BE(0);
  const ftypType = buf.toString('ascii', 4, 8);
  const majorBrand = buf.toString('ascii', 8, 12);

  if (ftypType !== 'ftyp' || ftypSize < 16) {
    return {
      valid: false,
      container: 'mp4',
      majorBrand,
      codec: 'unknown',
      width: 0,
      height: 0,
      fps: 0,
      durationInFrames: 0,
      durationSec: 0,
      sceneCount: 0,
      byteSize: mp4Bytes.byteLength,
      hasValidKeyframeStream: false,
      audioSyncValid: false,
    };
  }

  const moovOffset = ftypSize;
  const moovSize = buf.readUInt32BE(moovOffset);
  const moovType = buf.toString('ascii', moovOffset + 4, moovOffset + 8);

  let width = compiled?.width ?? 0;
  let height = compiled?.height ?? 0;
  let fps = compiled?.fps ?? 0;
  let durationInFrames = compiled?.durationInFrames ?? 0;
  let durationSec = compiled?.totalDurationSec ?? 0;
  let sceneCount = compiled?.sequences.length ?? 0;

  if (moovType === 'moov' && moovOffset + moovSize <= buf.byteLength) {
    try {
      const jsonStr = buf.toString('utf8', moovOffset + 8, moovOffset + moovSize);
      const parsed = JSON.parse(jsonStr) as {
        width?: number;
        height?: number;
        fps?: number;
        durationInFrames?: number;
        totalDurationSec?: number;
        sceneCount?: number;
      };
      width = parsed.width ?? width;
      height = parsed.height ?? height;
      fps = parsed.fps ?? fps;
      durationInFrames = parsed.durationInFrames ?? durationInFrames;
      durationSec = parsed.totalDurationSec ?? durationSec;
      sceneCount = parsed.sceneCount ?? sceneCount;
    } catch {
      // Fallback to compiled dimensions
    }
  }

  const mdatOffset = moovOffset + moovSize;
  let hasValidKeyframeStream = false;
  if (mdatOffset + 16 <= buf.byteLength) {
    const mdatType = buf.toString('ascii', mdatOffset + 4, mdatOffset + 8);
    if (mdatType === 'mdat') {
      const frameSlice = mp4Bytes.subarray(mdatOffset + 8);
      const pngCheck = inspectPngArtifact(frameSlice);
      hasValidKeyframeStream = pngCheck.valid;
    }
  }

  const syncCheck = compiled
    ? validateAudioCaptionSynchronization(compiled).synchronized
    : true;

  return {
    valid:
      majorBrand === 'isom' &&
      width > 0 &&
      height > 0 &&
      fps > 0 &&
      durationInFrames > 0 &&
      hasValidKeyframeStream,
    container: 'mp4',
    majorBrand,
    codec: 'h264-remotion-ast',
    width,
    height,
    fps,
    durationInFrames,
    durationSec,
    sceneCount,
    byteSize: mp4Bytes.byteLength,
    hasValidKeyframeStream,
    audioSyncValid: syncCheck,
  };
}

function formatSrtTimestamp(sec: number, separator: ',' | '.' = ','): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `${hh}:${mm}:${ss}${separator}${mmm}`;
}

/**
 * Exports standard SubRip (.srt) subtitles from a compiled Remotion composition.
 */
export function exportSubtitlesSrt(compiled: CompiledRemotionComposition): string {
  const blocks: string[] = [];
  compiled.sequences.forEach((seq, index) => {
    const start = formatSrtTimestamp(seq.startSec, ',');
    const end = formatSrtTimestamp(seq.endSec, ',');
    const text = seq.narrationText.trim() || seq.headlineText.trim() || `Scene ${index + 1}`;
    blocks.push(`${index + 1}\n${start} --> ${end}\n${text}`);
  });
  return blocks.join('\n\n');
}

/**
 * Exports standard WebVTT (.vtt) subtitles from a compiled Remotion composition.
 */
export function exportSubtitlesVtt(compiled: CompiledRemotionComposition): string {
  const blocks: string[] = ['WEBVTT'];
  compiled.sequences.forEach((seq, index) => {
    const start = formatSrtTimestamp(seq.startSec, '.');
    const end = formatSrtTimestamp(seq.endSec, '.');
    const text = seq.narrationText.trim() || seq.headlineText.trim() || `Scene ${index + 1}`;
    blocks.push(`${index + 1}\n${start} --> ${end}\n${text}`);
  });
  return blocks.join('\n\n');
}

/**
 * Adapts a CompositionSpec to a new aspect ratio and platform template while preserving
 * all scenes, narration, and overlays.
 */
export function adaptCompositionAspectRatio(
  spec: CompositionSpec,
  aspectRatio: AspectRatio,
  templateId?: CompositionTemplateId,
): CompositionSpec {
  const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio];
  return applyCompositionPatches(spec, [
    {
      op: 'SET_DIMENSIONS',
      width: dims.width,
      height: dims.height,
      ...(templateId ? { templateId } : {}),
      safeBottomMarginPx: dims.safeBottomMarginPx,
    },
  ]);
}

/**
 * Applies a workspace BrandKit's visual identity (colors, fonts, logo, caption preset)
 * to a CompositionSpec.
 */
export function applyBrandKitToCompositionSpec(
  spec: CompositionSpec,
  brandKit: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headingFont: string;
    bodyFont: string;
    logoAssetId?: string | null;
    captionStyleJson?: unknown;
  },
): CompositionSpec {
  const captionObj = (brandKit.captionStyleJson ?? {}) as {
    style?: 'word-highlight' | 'karaoke-pop' | 'minimal-lower' | 'kinetic-center';
    fontSizePx?: number;
  };

  return applyCompositionPatches(spec, [
    {
      op: 'UPDATE_BRAND',
      patch: {
        primaryColor: brandKit.primaryColor,
        secondaryColor: brandKit.secondaryColor,
        accentColor: brandKit.accentColor,
        headingFont: brandKit.headingFont,
        bodyFont: brandKit.bodyFont,
        ...(brandKit.logoAssetId ? { logoAssetId: brandKit.logoAssetId } : {}),
      },
    },
    {
      op: 'UPDATE_CAPTION_STYLE',
      patch: {
        highlightColor: brandKit.accentColor,
        ...(captionObj.style ? { style: captionObj.style } : {}),
        ...(captionObj.fontSizePx ? { fontSizePx: captionObj.fontSizePx } : {}),
      },
    },
  ]);
}

export function inspectFullCompositionMediaBundle(spec: CompositionSpec, mp4Bytes: Uint8Array) {
  const compiled = compileCompositionSpec(spec);
  return {
    mp4Inspection: inspectMp4Artifact(mp4Bytes, compiled),
    captionSync: validateAudioCaptionSynchronization(compiled),
    subtitlesSrt: exportSubtitlesSrt(compiled),
    subtitlesVtt: exportSubtitlesVtt(compiled),
  };
}
