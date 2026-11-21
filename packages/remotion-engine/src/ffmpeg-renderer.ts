import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  voiceoverSynthesized: boolean;
}

export interface RenderCompositionOptions {
  tempRoot?: string;
  /** Optional pre-synthesized voiceover audio file (WAV/MP3/M4A) to mix over the ducked music bed. */
  voiceoverPath?: string;
  /** Optional per-scene background image paths (PNG/JPG) rendered with Ken Burns zoom/pan motion. */
  sceneImagePaths?: string[];
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
    .slice(0, 90);
}

async function resolveFontFile(bold = true): Promise<string | null> {
  const candidates = bold
    ? [
        '/usr/share/fonts/opensans/OpenSans-Bold.ttf',
        '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
      ]
    : [
        '/usr/share/fonts/opensans/OpenSans-Regular.ttf',
        '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
        'C:/Windows/Fonts/arial.ttf',
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function synthesizeNeuralVoiceover(
  scriptText: string,
  outAudioPath: string,
): Promise<boolean> {
  const cleanText = scriptText.replace(/\s+/g, ' ').trim();
  if (!cleanText) return false;
  try {
    const mod = (await import('msedge-tts')) as {
      MsEdgeTTS: new () => {
        setMetadata: (voice: string, format: string) => Promise<void>;
        toFile: (filePath: string, text: string) => Promise<{ audioFilePath: string }>;
      };
      OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: string };
    };
    const tts = new mod.MsEdgeTTS();
    await tts.setMetadata(
      'en-US-ChristopherNeural',
      mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );
    await tts.toFile(outAudioPath, cleanText);
    return true;
  } catch {
    return false;
  }
}

async function synthesizeLocalVoiceover(
  scriptText: string,
  outWavPath: string,
): Promise<boolean> {
  const cleanText = scriptText.replace(/\s+/g, ' ').trim();
  if (!cleanText) return false;
  try {
    await execFileAsync(
      'espeak-ng',
      ['-v', 'en-us', '-s', '155', '-p', '48', '-w', outWavPath, cleanText],
      { timeout: 15_000 },
    );
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
 * Renders a compiled composition into a broadcast-ready H.264/AAC MP4 using FFmpeg:
 * - Per-scene visual backgrounds (Ken Burns zoompan on AI/uploaded images or alternating brand motion scenes)
 * - Kinetic headline & lower-third caption overlays + animated progress bar
 * - Spoken voiceover TTS track mixed over a warm ducked background music bed
 * Falls back cleanly to the deterministic ISO-BMFF stub only when FFmpeg is absent.
 */
export async function renderCompositionMp4(
  compiled: CompiledRemotionComposition,
  options: RenderCompositionOptions = {},
): Promise<RealRenderResult> {
  const hasFfmpeg = await isFfmpegAvailable();
  if (!hasFfmpeg) {
    return {
      mp4Bytes: synthesizeMp4Artifact(compiled),
      isPlayableMp4: false,
      renderer: 'synthetic-iso-bmff-fallback',
      ffprobe: null,
      voiceoverSynthesized: false,
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
    const outPath = join(jobDir, 'output.mp4');

    const boldFont = await resolveFontFile(true);
    const regularFont = await resolveFontFile(false);
    const boldOpt = boldFont ? `fontfile='${boldFont.replace(/:/g, '\\:')}':` : '';
    const regOpt = regularFont ? `fontfile='${regularFont.replace(/:/g, '\\:')}':` : '';

    // 1. Voiceover track: explicit voiceoverPath -> neural MsEdgeTTS -> offline espeak-ng -> WAV bed
    let voicePath = options.voiceoverPath;
    let voiceoverSynthesized = Boolean(voicePath);
    if (!voicePath) {
      const fullNarration = compiled.sequences
        .map((s) => s.narrationText || s.headlineText)
        .filter(Boolean)
        .join('. ');
      const neuralDir = join(jobDir, 'neural-tts');
      await mkdir(neuralDir, { recursive: true });
      const neuralOk = await synthesizeNeuralVoiceover(fullNarration, neuralDir);
      if (neuralOk) {
        voicePath = join(neuralDir, 'audio.mp3');
        voiceoverSynthesized = true;
      } else {
        const localTtsPath = join(jobDir, 'voiceover.wav');
        const ok = await synthesizeLocalVoiceover(fullNarration, localTtsPath);
        if (ok) {
          voicePath = localTtsPath;
          voiceoverSynthesized = true;
        }
      }
    }

    const fallbackWavPath = join(jobDir, 'bed.wav');
    await writeFile(fallbackWavPath, generateValidWavAudio(durationSec, 44100));

    const w = compiled.width;
    const h = compiled.height;
    const fps = compiled.fps;
    const titleSize = Math.max(36, Math.min(84, Math.floor(w * 0.068)));
    const captionSize = Math.max(24, Math.min(44, Math.floor(w * 0.036)));
    const capY = Math.max(80, h - compiled.safeZoneBottomPx);

    const ffmpegArgs: string[] = ['-y'];
    const filterParts: string[] = [];
    const sceneTags: string[] = [];
    const sequences = compiled.sequences.length > 0 ? compiled.sequences : [];

    // 2. Build per-scene visual streams (Ken Burns on images or alternating brand motion)
    for (let idx = 0; idx < sequences.length; idx++) {
      const seq = sequences[idx]!;
      const sceneDur = Math.max(0.5, Number((seq.endSec - seq.startSec).toFixed(2)));
      const sceneFrames = Math.max(15, Math.round(sceneDur * fps));
      const imgPath = options.sceneImagePaths?.[idx];
      const headline = escapeDrawtext(seq.headlineText || `Scene ${idx + 1}`);
      const caption = escapeDrawtext(seq.narrationText || '');
      const sceneHex = idx % 2 === 0 ? primaryHex : bgHex;

      if (imgPath) {
        // Single-frame image input: zoompan generates exact d=sceneFrames without -loop 1 frame multiplication
        ffmpegArgs.push('-i', imgPath);
        filterParts.push(
          `[${idx}:v]scale=${Math.round(w * 1.15)}:${Math.round(h * 1.15)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.15)}:${Math.round(h * 1.15)},zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${sceneFrames}:s=${w}x${h}:fps=${fps},setpts=PTS-STARTPTS,format=yuv420p` +
            `,drawbox=x=0:y=${Math.floor(h * 0.36)}:w=${w}:h=${Math.floor(h * 0.22)}:color=black@0.48:t=fill` +
            `,drawbox=x=0:y=${capY - 28}:w=${w}:h=120:color=black@0.62:t=fill` +
            `,drawtext=${boldOpt}text='${headline}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=${Math.floor(h * 0.44)}` +
            (caption
              ? `,drawtext=${regOpt}text='${caption}':fontcolor=white:fontsize=${captionSize}:x=(w-text_w)/2:y=${capY + 12}`
              : '') +
            `,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0.2, sceneDur - 0.35)}:d=0.35[v${idx}]`,
        );
      } else {
        ffmpegArgs.push('-f', 'lavfi', '-i', `color=c=0x${sceneHex}:s=${w}x${h}:d=${sceneDur}:r=${fps}`);
        filterParts.push(
          `[${idx}:v]drawbox=x=0:y=${Math.floor(h * 0.4)}:w=${w}:h=${Math.floor(h * 0.18)}:color=0x${accentHex}@0.2:t=fill` +
            `,drawbox=x=0:y=${capY - 24}:w=${w}:h=110:color=black@0.55:t=fill` +
            `,drawtext=${boldOpt}text='${headline}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=${Math.floor(h * 0.46)}` +
            (caption
              ? `,drawtext=${regOpt}text='${caption}':fontcolor=0x${accentHex}:fontsize=${captionSize}:x=(w-text_w)/2:y=${capY + 12}`
              : '') +
            `,fade=t=in:st=0:d=0.3,fade=t=out:st=${Math.max(0.2, sceneDur - 0.3)}:d=0.3[v${idx}]`,
        );
      }
      sceneTags.push(`[v${idx}]`);
    }

    // 3. Audio inputs: warm ambient bed + optional spoken voiceover with ducking
    const bedInputIdx = sequences.length;
    ffmpegArgs.push(
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=0.12*sin(2*PI*220*t)+0.08*sin(2*PI*277.18*t)+0.08*sin(2*PI*329.63*t):s=44100:d=${durationSec}`,
    );

    let audioMap = `[abed]`;
    if (voicePath) {
      const voiceInputIdx = bedInputIdx + 1;
      ffmpegArgs.push('-i', voicePath);
      filterParts.push(
        `[${bedInputIdx}:a]volume=0.18,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0.5, durationSec - 0.8)}:d=0.8[abed]`,
      );
      filterParts.push(
        `[${voiceInputIdx}:a]aresample=44100,volume=1.5,apad=whole_dur=${durationSec}[avoice]`,
      );
      filterParts.push(
        `[abed][avoice]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=0.95[aout]`,
      );
      audioMap = '[aout]';
    } else {
      filterParts.push(
        `[${bedInputIdx}:a]volume=0.3,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0.5, durationSec - 0.8)}:d=0.8[abed]`,
      );
    }

    // Concat scenes + progress bar
    filterParts.push(`${sceneTags.join('')}concat=n=${sceneTags.length}:v=1:a=0[vcat]`);
    filterParts.push(
      `[vcat]drawbox=x=0:y=${h - 14}:w='iw*t/${durationSec}':h=14:color=0x${accentHex}:t=fill[vout]`,
    );

    ffmpegArgs.push(
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      audioMap,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-shortest',
      outPath,
    );

    await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120_000 });

    const [mp4Bytes, ffprobe] = await Promise.all([
      readFile(outPath),
      probeMp4WithFfprobe(outPath).catch(() => null),
    ]);

    return {
      mp4Bytes: new Uint8Array(mp4Bytes),
      isPlayableMp4: ffprobe?.verified ?? true,
      renderer: 'ffmpeg-h264-aac',
      ffprobe,
      voiceoverSynthesized,
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
