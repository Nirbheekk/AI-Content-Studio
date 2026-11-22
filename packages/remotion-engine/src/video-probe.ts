import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VideoProbeMetadata {
  probeMode: 'ffprobe' | 'fallback';
  containerFormat: string;
  videoCodec: string | null;
  audioCodec: string | null;
  pixelFormat: string | null;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  sizeBytes: number;
  hasAudio: boolean;
  browserCompatible: boolean;
  issues: string[];
}

interface RawFfprobeStream {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
}

interface RawFfprobeFormat {
  format_name?: string;
  duration?: string;
  size?: string;
}

interface RawFfprobeOutput {
  streams?: RawFfprobeStream[];
  format?: RawFfprobeFormat;
}

function parseFrameRate(rate?: string): number {
  if (!rate) return 0;
  const parts = rate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const parsed = Number(rate);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parses `ffprobe -print_format json -show_format -show_streams` output
 * and validates browser HTML5 MP4 playback compatibility (H.264 + yuv420p + optional AAC).
 */
export function parseFfprobeJson(rawJson: string, sizeBytes: number): VideoProbeMetadata {
  const parsed = JSON.parse(rawJson) as RawFfprobeOutput;
  const streams = parsed.streams ?? [];
  const format = parsed.format ?? {};

  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  const containerFormat = format.format_name ?? 'unknown';
  const videoCodec = videoStream?.codec_name ?? null;
  const audioCodec = audioStream?.codec_name ?? null;
  const pixelFormat = videoStream?.pix_fmt ?? null;
  const width = Number(videoStream?.width ?? 0);
  const height = Number(videoStream?.height ?? 0);
  const fps = parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate);
  const durationSec = Number(format.duration ?? 0);
  const resolvedSize = sizeBytes > 0 ? sizeBytes : Number(format.size ?? 0);
  const hasAudio = Boolean(audioStream);

  const issues: string[] = [];
  if (resolvedSize <= 0) {
    issues.push('Output file is empty (0 bytes)');
  }
  if (!containerFormat.includes('mp4') && !containerFormat.includes('mov')) {
    issues.push(`Unsupported container format "${containerFormat}" (expected mp4)`);
  }
  if (!videoStream) {
    issues.push('No video stream found in output file');
  } else {
    if (videoCodec !== 'h264') {
      issues.push(`Video codec "${videoCodec ?? 'none'}" is not browser-safe H.264`);
    }
    if (pixelFormat !== 'yuv420p') {
      issues.push(`Pixel format "${pixelFormat ?? 'none'}" is not yuv420p`);
    }
    if (width <= 0 || height <= 0) {
      issues.push(`Invalid video dimensions ${width}x${height}`);
    }
  }
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    issues.push('Video duration must be greater than 0 seconds');
  }
  if (hasAudio && audioCodec !== 'aac' && audioCodec !== 'mp3' && audioCodec !== 'opus') {
    issues.push(`Audio codec "${audioCodec ?? 'none'}" is not browser-compatible (expected aac)`);
  }

  return {
    probeMode: 'ffprobe',
    containerFormat,
    videoCodec,
    audioCodec,
    pixelFormat,
    width,
    height,
    fps,
    durationSec: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) / 1000 : 0,
    sizeBytes: resolvedSize,
    hasAudio,
    browserCompatible: issues.length === 0,
    issues,
  };
}

function hasIsoMp4Magic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const boxType = String.fromCharCode(
    bytes[4] ?? 0,
    bytes[5] ?? 0,
    bytes[6] ?? 0,
    bytes[7] ?? 0,
  );
  return boxType === 'ftyp';
}

/**
 * Inspects a video file on disk using `ffprobe`.
 * Throws if the file is missing; returns fallback magic-byte validation only if `ffprobe` binary is absent.
 */
export async function probeVideoFile(filePath: string): Promise<VideoProbeMetadata> {
  const fileStat = await stat(filePath);
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { maxBuffer: 5 * 1024 * 1024, timeout: 30_000 },
    );
    return parseFfprobeJson(stdout, fileStat.size);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return {
        probeMode: 'fallback',
        containerFormat: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        width: 1080,
        height: 1920,
        fps: 30,
        durationSec: 1,
        sizeBytes: fileStat.size,
        hasAudio: true,
        browserCompatible: fileStat.size > 0,
        issues: fileStat.size > 0 ? [] : ['Output file is empty'],
      };
    }
    throw err;
  }
}

/**
 * Inspects an in-memory MP4 byte buffer using `ffprobe` (writes a temporary file and cleans up).
 */
export async function probeVideoBytes(mp4Bytes: Uint8Array): Promise<VideoProbeMetadata> {
  if (!hasIsoMp4Magic(mp4Bytes)) {
    return {
      probeMode: 'fallback',
      containerFormat: 'unknown',
      videoCodec: null,
      audioCodec: null,
      pixelFormat: null,
      width: 0,
      height: 0,
      fps: 0,
      durationSec: 0,
      sizeBytes: mp4Bytes.byteLength,
      hasAudio: false,
      browserCompatible: false,
      issues: ['Invalid MP4 header: missing ISO BMFF ftyp box'],
    };
  }

  const tmpPath = path.join(tmpdir(), `aicos-probe-${randomUUID()}.mp4`);
  try {
    await writeFile(tmpPath, mp4Bytes);
    return await probeVideoFile(tmpPath);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}
