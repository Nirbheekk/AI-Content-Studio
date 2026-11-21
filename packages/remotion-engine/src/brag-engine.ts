import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GeminiStudioClient } from '@ai-content-os/ai-providers';
import { CompiledRemotionComposition, synthesizeMp4Artifact } from './compiler.js';
import {
  buildSpeechAlignedWords,
  probeAudioDurationSec,
  SceneVoiceTiming,
  synthesizeMusicAndSfx,
  synthesizeSceneVoiceover,
  writeKaraokeAssFile,
} from './audio-pipeline.js';
import {
  isFfmpegAvailable,
  probeMp4WithFfprobe,
  RealRenderResult,
  RenderCompositionOptions,
} from './ffmpeg-renderer.js';

const execFileAsync = promisify(execFile);

function toHex(color: string, fallback = '0F172A'): string {
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
    .slice(0, 84);
}

async function resolveBoldFont(): Promise<string | null> {
  const candidates = [
    '/usr/share/fonts/opensans/OpenSans-Bold.ttf',
    '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
  ];
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Synthesizes per-scene voiceover following the Brag + Google AI Studio priority chain:
 * 1. Google AI Studio Gemini 3.8 Flash TTS (`GEMINI_API_KEY`)
 * 2. Local Kokoro TTS HTTP server (`KOKORO_TTS_URL`, matching latent-spaces/brag)
 * 3. Neural Edge TTS (`msedge-tts` `en-US-ChristopherNeural`)
 * 4. Offline `espeak-ng`
 */
async function synthesizeBragSceneVoice(
  text: string,
  sceneDir: string,
  gemini: GeminiStudioClient,
): Promise<{ audioPath: string; durationSec: number; provider: string } | null> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  await mkdir(sceneDir, { recursive: true });

  // 1. Google AI Studio Gemini 3.8 Flash TTS
  if (gemini.isConfigured()) {
    try {
      const result = await gemini.synthesizeVoiceover(clean);
      if (result && result.bytes.byteLength > 256) {
        const ext = result.mimeType.includes('mpeg') || result.mimeType.includes('mp3') ? 'mp3' : 'wav';
        const outPath = join(sceneDir, `gemini-voice.${ext}`);
        await writeFile(outPath, result.bytes);
        const durationSec = await probeAudioDurationSec(outPath);
        return { audioPath: outPath, durationSec, provider: result.model };
      }
    } catch {
      // Fall through cleanly
    }
  }

  // 2. Local Kokoro TTS endpoint (latent-spaces/brag reference)
  const kokoroUrl = process.env['KOKORO_TTS_URL'];
  if (kokoroUrl) {
    try {
      const res = await fetch(`${kokoroUrl.replace(/\/$/, '')}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'kokoro', input: clean, voice: 'af_heart' }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const outPath = join(sceneDir, 'kokoro-voice.wav');
        await writeFile(outPath, buf);
        const durationSec = await probeAudioDurationSec(outPath);
        return { audioPath: outPath, durationSec, provider: 'kokoro-tts' };
      }
    } catch {
      // Fall through cleanly
    }
  }

  // 3. Neural Edge TTS / Offline espeak-ng
  const local = await synthesizeSceneVoiceover(clean, sceneDir);
  if (local) {
    return { ...local, provider: local.audioPath.endsWith('.mp3') ? 'msedge-neural-tts' : 'espeak-ng' };
  }
  return null;
}

/**
 * Full Brag-style SOTA video production renderer:
 * - Per-scene AI visual generation via Gemini Nano Banana 2.1 when GEMINI_API_KEY is present (or caller sceneImagePaths)
 * - Per-scene expressive voiceover via Gemini 3.8 Flash TTS -> Kokoro -> Neural Edge TTS -> espeak-ng
 * - Speech-driven scene durations (every cut aligns to spoken cadence)
 * - Word-by-word ASS karaoke highlighted captions
 * - Smooth `xfade` transitions + 120 BPM rhythmic music bed + timed Foley whoosh SFX + `sidechaincompress` ducking
 */
export async function executeBragRenderPipeline(
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
  const jobDir = join(baseRoot, `brag-render-${randomUUID()}`);
  await mkdir(jobDir, { recursive: true });

  try {
    const gemini = new GeminiStudioClient();
    const sequences = compiled.sequences;
    const w = compiled.width;
    const h = compiled.height;
    const fps = compiled.fps;
    const primaryHex = toHex(compiled.brand.primaryColor, 'F40009');
    const secondaryHex = toHex(compiled.brand.secondaryColor, '141416');
    const accentHex = toHex(compiled.brand.accentColor, 'F40009');
    const boldFont = await resolveBoldFont();
    const boldOpt = boldFont ? `fontfile='${boldFont.replace(/:/g, '\\:')}':` : '';
    const xfadeDur = sequences.length > 1 ? 0.45 : 0;

    // 1. Per-scene voiceover + optional Gemini Nano Banana 2.1 visual generation
    const timings: SceneVoiceTiming[] = [];
    const resolvedImages: Array<string | null> = [];
    let cursor = 0;
    let voiceCount = 0;

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i]!;
      const sceneDir = join(jobDir, `scene-${i}`);
      await mkdir(sceneDir, { recursive: true });

      const narration = (seq.narrationText || seq.headlineText || `Scene ${i + 1}`).trim();
      const voiceRes = await synthesizeBragSceneVoice(narration, sceneDir, gemini);
      if (voiceRes) voiceCount++;

      const speechDur = voiceRes?.durationSec ?? Math.max(2.5, seq.endSec - seq.startSec);
      const sceneDur = Number(
        (speechDur + 0.65 + (i < sequences.length - 1 ? xfadeDur : 0.25)).toFixed(2),
      );
      const speechStart = Number((cursor + 0.2).toFixed(2));

      timings.push({
        sceneIndex: i,
        audioPath: voiceRes?.audioPath ?? null,
        speechDurationSec: speechDur,
        sceneDurationSec: sceneDur,
        startSec: cursor,
        endSec: cursor + sceneDur,
        words: buildSpeechAlignedWords(narration, speechStart, speechDur),
      });
      cursor += sceneDur - (i < sequences.length - 1 ? xfadeDur : 0);

      let imgPath: string | null = options.sceneImagePaths?.[i] ?? null;
      if (!imgPath && gemini.isConfigured() && process.env['ENABLE_GEMINI_SCENE_IMAGES'] !== 'false') {
        try {
          const genImg = await gemini.generateSceneImage(
            `Vertical ${w}x${h} studio commercial photography, no text, cinematic lighting: ${seq.headlineText}. ${narration}`,
          );
          if (genImg && genImg.bytes.byteLength > 1024) {
            const p = join(sceneDir, 'scene.png');
            await writeFile(p, genImg.bytes);
            imgPath = p;
          }
        } catch {
          // Proceed with brand motion graphics background
        }
      }
      resolvedImages.push(imgPath);
    }

    const totalDur = Math.max(2, Number(cursor.toFixed(2)));
    const cutTimestamps: number[] = [];
    let acc = 0;
    for (let i = 0; i < timings.length - 1; i++) {
      acc += timings[i]!.sceneDurationSec - xfadeDur;
      cutTimestamps.push(Number(acc.toFixed(2)));
    }

    // 2. Write ASS word-by-word karaoke subtitle file + synthesize rhythmic music & Foley SFX
    const assPath = join(jobDir, 'karaoke.ass');
    await writeKaraokeAssFile({
      timings,
      width: w,
      height: h,
      highlightHex: `#${accentHex}`,
      outPath: assPath,
    });
    const { musicPath, sfxPath } = await synthesizeMusicAndSfx({
      durationSec: totalDur,
      cutTimestampsSec: cutTimestamps,
      jobDir,
    });

    // 3. Assemble FFmpeg filtergraph (Ken Burns + xfade + ASS karaoke + sidechaincompress voice/music + SFX)
    const args: string[] = ['-y'];
    const filters: string[] = [];
    const titleSize = Math.max(42, Math.min(92, Math.floor(w * 0.075)));

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i]!;
      const timing = timings[i]!;
      const frames = Math.max(15, Math.round(timing.sceneDurationSec * fps));
      const img = resolvedImages[i];
      const headline = escapeDrawtext(seq.headlineText || `Scene ${i + 1}`);
      const zoomExpr =
        i % 2 === 0 ? "min(zoom+0.0010,1.12)" : "if(lte(on,1),1.12,max(1.0,zoom-0.0010))";

      if (img) {
        args.push('-i', img);
        filters.push(
          `[${i}:v]scale=${Math.round(w * 1.15)}:${Math.round(h * 1.15)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.15)}:${Math.round(h * 1.15)},zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps},setpts=PTS-STARTPTS,eq=contrast=1.06:saturation=1.14,vignette=PI/5,format=yuv420p` +
            `,drawbox=x=0:y=${Math.floor(h * 0.68)}:w=${w}:h=${Math.floor(h * 0.32)}:color=black@0.58:t=fill` +
            `,drawbox=x=${Math.floor(w * 0.36)}:y=${Math.floor(h * 0.70)}:w=${Math.floor(w * 0.28)}:h=8:color=0x${accentHex}:t=fill` +
            `,drawtext=${boldOpt}text='${headline}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=${Math.floor(h * 0.73)}[v${i}]`,
        );
      } else {
        const bg = i % 2 === 0 ? primaryHex : secondaryHex;
        args.push('-f', 'lavfi', '-i', `color=c=0x${bg}:s=${w}x${h}:d=${timing.sceneDurationSec}:r=${fps}`);
        filters.push(
          `[${i}:v]drawbox=x=0:y=${Math.floor(h * 0.68)}:w=${w}:h=${Math.floor(h * 0.32)}:color=black@0.48:t=fill` +
            `,drawbox=x=${Math.floor(w * 0.36)}:y=${Math.floor(h * 0.42)}:w=${Math.floor(w * 0.28)}:h=8:color=0x${accentHex}:t=fill` +
            `,drawtext=${boldOpt}text='${headline}':fontcolor=white:fontsize=${titleSize}:x=(w-text_w)/2:y=${Math.floor(h * 0.46)}[v${i}]`,
        );
      }
    }

    // Chain xfade transitions
    let lastVideoTag = '[v0]';
    for (let i = 1; i < sequences.length; i++) {
      const nextTag = `[vx${i}]`;
      const transition = i % 2 === 1 ? 'smoothleft' : 'fadeblack';
      const offset = cutTimestamps[i - 1] ?? 3;
      filters.push(`${lastVideoTag}[v${i}]xfade=transition=${transition}:duration=${xfadeDur}:offset=${offset}${nextTag}`);
      lastVideoTag = nextTag;
    }

    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(
      `${lastVideoTag}ass='${escapedAss}',drawbox=x=0:y=${h - 14}:w='iw*t/${totalDur}':h=14:color=0x${accentHex}:t=fill,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0.2, totalDur - 0.45).toFixed(2)}:d=0.45[vout]`,
    );

    // Audio inputs: music + sfx + per-scene voiceovers
    const musicIdx = sequences.length;
    const sfxIdx = sequences.length + 1;
    args.push('-i', musicPath, '-i', sfxPath);

    const voiceTags: string[] = [];
    let nextInputIdx = sequences.length + 2;
    for (const timing of timings) {
      if (!timing.audioPath) continue;
      args.push('-i', timing.audioPath);
      const delayMs = Math.round((timing.startSec + 0.2) * 1000);
      const vTag = `[va${timing.sceneIndex}]`;
      filters.push(`[${nextInputIdx}:a]aresample=44100,adelay=${delayMs}|${delayMs}${vTag}`);
      voiceTags.push(vTag);
      nextInputIdx++;
    }

    let audioOut = '[aout]';
    if (voiceTags.length > 0) {
      filters.push(
        `${voiceTags.join('')}amix=inputs=${voiceTags.length}:duration=longest:normalize=0,volume=1.55,apad=whole_dur=${totalDur},asplit=2[voice_mix][voice_sc]`,
      );
      filters.push(`[${musicIdx}:a]volume=0.34[music_raw]`);
      filters.push(
        `[music_raw][voice_sc]sidechaincompress=threshold=0.03:ratio=6:attack=25:release=320[music_ducked]`,
      );
      filters.push(`[${sfxIdx}:a]volume=0.55[sfx_mix]`);
      filters.push(
        `[music_ducked][voice_mix][sfx_mix]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.95[aout]`,
      );
    } else {
      filters.push(
        `[${musicIdx}:a][${sfxIdx}:a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`,
      );
      audioOut = '[aout]';
    }

    const outPath = join(jobDir, 'brag-output.mp4');
    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vout]',
      '-map', audioOut,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-t', String(totalDur),
      outPath,
    );

    await execFileAsync('ffmpeg', args, { timeout: 150_000 });
    const [mp4Bytes, ffprobe] = await Promise.all([
      readFile(outPath),
      probeMp4WithFfprobe(outPath).catch(() => null),
    ]);

    return {
      mp4Bytes: new Uint8Array(mp4Bytes),
      isPlayableMp4: ffprobe?.verified ?? true,
      renderer: 'ffmpeg-h264-aac',
      ffprobe,
      voiceoverSynthesized: voiceCount > 0,
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
