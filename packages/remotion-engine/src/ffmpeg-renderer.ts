import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { generateValidWavAudio } from '@ai-content-os/ai-providers';
import { CompiledRemotionComposition, synthesizeMp4Artifact } from './compiler.js';

const execFileAsync = promisify(execFile);

export interface FfprobeVerification {
  verified: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  streamCount: number;
}

export interface RealRenderResult {
  mp4Bytes: Uint8Array;
  isPlayableMp4: boolean;
  renderer: 'ffmpeg-h264-aac' | 'synthetic-iso-bmff-fallback';
  ffprobe: FfprobeVerification | null;
}

function toFfmpegHex(color: string, fallback = '0F172A'): string {
  const clean = color.replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 80);
}

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function probeMp4WithFfprobe(filePath: string): Promise<FfprobeVerification> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
    { timeout: 10_000 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  return {
    verified: Boolean(video && audio && video.codec_name === 'h264' && audio.codec_name === 'aac'),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    width: typeof video?.width === 'number' ? video.width : null,
    height: typeof video?.height === 'number' ? video.height : null,
    durationSec: parsed.format?.duration ? Number(parsed.format.duration) : null,
    streamCount: streams.length,
  };
}

/**
 * Renders a compiled composition into a genuinely playable H.264/AAC MP4 using FFmpeg
 * when FFmpeg is available (e.g. inside `rendering-worker`), or falls back to the
 * deterministic synthetic ISO-BMFF stub on hosts without FFmpeg.
 */
export async function renderCompositionMp4(
  compiled: CompiledRemotionComposition,
  options: { tempRoot?: string } = {},
): Promise<RealRenderResult> {
  const hasFfmpeg = await isFfmpegAvailable();
  if (!hasFfmpeg) {
    return {
      mp4Bytes: synthesizeMp4Artifact(compiled),
      isPlayableMp4: false,
      renderer: 'synthetic-iso-bmff-fallback',
      ffprobe: null,
    };
  }

  const baseRoot = options.tempRoot ?? process.env['REMOTION_TMP_DIR'] ?? tmpdir();
  const jobDir = join(baseRoot, `render-${randomUUID()}`);
  await mkdir(jobDir, { recursive: true });

  try {
    const durationSec = Math.max(1, Number(compiled.totalDurationSec.toFixed(2)));
    const bgHex = toFfmpegHex(compiled.brand.secondaryColor, '0F172A');
    const accentHex = toFfmpegHex(compiled.brand.accentColor, '22D3EE');
    const primaryHex = toFfmpegHex(compiled.brand.primaryColor, '6366F1');
    const wavPath = join(jobDir, 'audio.wav');
    const outPath = join(jobDir, 'output.mp4');

    const wavBytes = generateValidWavAudio(durationSec, 44100);
    await writeFile(wavPath, wavBytes);

    const w = compiled.width;
    const h = compiled.height;
    const fps = compiled.fps;
    const bandH = Math.max(20, Math.floor(h * 0.14));
    const bandY = Math.floor((h - bandH) / 2);
    const titleSize = Math.max(24, Math.min(64, Math.floor(w * 0.042)));
    const captionSize = Math.max(20, Math.min(48, Math.floor(compiled.captions.fontSizePx * 0.7)));

    const filters: string[] = [
      `drawbox=x=0:y=${bandY}:w=${w}:h=${bandH}:color=0x${primaryHex}@0.28:t=fill`,
      `drawbox=x=0:y=${bandY}:w=${w}:h=6:color=0x${accentHex}@0.9:t=fill`,
    ];

    for (const seq of compiled.sequences) {
      const headline = escapeDrawtext(seq.headlineText || `Scene ${seq.orderIndex + 1}`);
      const enableExpr = `between(t\\,${seq.startSec}\\,${seq.endSec})`;
      filters.push(
        `drawtext=text='${headline}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=(h-text_h)/2-24:enable='${enableExpr}'`,
      );
      if (compiled.captions.enabled && seq.narrationText) {
        const caption = escapeDrawtext(seq.narrationText);
        const capY = Math.max(40, h - compiled.safeZoneBottomPx);
        filters.push(
          `drawtext=text='${caption}':fontcolor=0x${accentHex}:fontsize=${captionSize}:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=${capY}:enable='${enableExpr}'`,
        );
      }
    }

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x${bgHex}:s=${w}x${h}:d=${durationSec}:r=${fps}`,
        '-i',
        wavPath,
        '-vf',
        filters.join(','),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-crf',
        '24',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        outPath,
      ],
      { timeout: 120_000 },
    );

    const ffprobe = await probeMp4WithFfprobe(outPath);
    const outBuffer = await readFile(outPath);

    return {
      mp4Bytes: new Uint8Array(outBuffer),
      isPlayableMp4: ffprobe.verified,
      renderer: 'ffmpeg-h264-aac',
      ffprobe,
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => null);
  }
}
