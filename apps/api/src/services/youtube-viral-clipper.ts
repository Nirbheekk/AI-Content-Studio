import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  ExecuteYoutubeViralClipRequest,
  ExecuteYoutubeViralClipResponse,
  ExternalProviderError,
  NotFoundError,
  WebcamCropPreset,
  YoutubeViralClipItem,
} from '@ai-content-os/shared';
import { prisma } from '@ai-content-os/database';
import { MinioStorageAdapter } from '@ai-content-os/integrations';
import { probeVideoFile } from '@ai-content-os/remotion-engine';
import { buildAssetStreamUrl } from '../lib/media-token.js';

const execFileAsync = promisify(execFile);

export interface VttCue {
  start: number;
  end: number;
  text: string;
}

export interface ScoredViralMoment {
  startSec: number;
  timestamp: string;
  viralScore: number;
  reactionHits: number;
  actionHits: number;
  wordCount: number;
  hookTitle: string;
  transcript: string;
  cues: VttCue[];
}

const PROFANITY_RE = /\b(fuck|shit|bitch|nigga|asshole|cunt|dick|nigg)\b/i;
const REACTION_RE =
  /\b(oh my god|oh my days|no way|bro|wait|crazy|insane|what|screaming|careful|everywhere|ending|finally|unbelievable|insanity|clutch|goat)\b/gi;
const ACTION_RE =
  /\b(gta|mission|police|car|shoot|save|helicopter|run|kill|beat|win|boss|cop|gun|crash|jump|clutch|launch|drop|secret|reveal|record)\b/gi;

const DEFAULT_FONT_PATH = '/usr/share/fonts/opensans/OpenSans-Bold.ttf';

function toSeconds(ts: string): number {
  const parts = ts.split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  return h * 3600 + m * 60 + s;
}

export function formatTimestamp(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const whole = Math.floor(rem);
  const cs = Math.min(99, Math.round((rem - whole) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '')
    .replace(/&lt;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVttCues(rawVtt: string): VttCue[] {
  const blocks = rawVtt.split(/\r?\n\r?\n/);
  const cues: VttCue[] = [];
  for (const block of blocks) {
    const match = block.match(/(\d\d:\d\d:\d\d\.\d{3})\s+-->\s+(\d\d:\d\d:\d\d\.\d{3})/);
    if (!match || !match[1] || !match[2]) continue;
    const start = toSeconds(match[1]);
    const end = toSeconds(match[2]);
    if (end - start < 0.25) continue;
    const lines = block
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const text = cleanCueText(lines[lines.length - 1] ?? '');
    if (text.length < 2) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

function inferHookTitle(fullText: string): string {
  if (/everywhere|careful/i.test(fullText)) return 'THEY ARE EVERYWHERE!';
  if (/ending|finally|over with/i.test(fullText)) return 'UNBELIEVABLE ENDING!';
  if (/save|car|crash/i.test(fullText)) return 'HE COULD NOT SAVE IT!';
  if (/no way|crazy|insane|unbelievable/i.test(fullText)) return 'NO WAY THIS HAPPENED!';
  if (/clutch|win|beat|boss/i.test(fullText)) return 'INSANE CLUTCH MOMENT!';
  return 'VIRAL HIGHLIGHT MOMENT';
}

export function detectAndScoreViralMoments(params: {
  cues: VttCue[];
  clipDurationSec: number;
  clipCount: number;
  totalDurationSec?: number;
}): ScoredViralMoment[] {
  const { cues, clipDurationSec, clipCount } = params;
  const candidates: ScoredViralMoment[] = [];
  const step = cues.length > 200 ? 6 : 2;
  const minGapSec = Math.max(90, clipDurationSec * 4);

  for (let i = 0; i < cues.length; i += step) {
    const cue = cues[i];
    if (!cue) continue;
    const start = cue.start;
    if (cues.length > 100 && start < 20) continue;

    const win = cues.filter((c) => c.start >= start && c.start < start + clipDurationSec);
    const uniqueLines = Array.from(new Set(win.map((w) => w.text)));
    const fullText = uniqueLines.join(' ');
    if (!fullText || PROFANITY_RE.test(fullText)) continue;

    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 12 || wordCount > 110) continue;

    const reactionHits = (fullText.match(REACTION_RE) ?? []).length;
    const actionHits = (fullText.match(ACTION_RE) ?? []).length;
    const idealWords = Math.round(clipDurationSec * 2.5);
    const pacingScore = Math.max(0, 25 - Math.abs(wordCount - idealWords) * 0.6);
    const viralScore = Math.min(
      99,
      Math.max(50, Math.round(45 + reactionHits * 7 + actionHits * 6 + pacingScore * 0.6)),
    );

    candidates.push({
      startSec: Math.floor(start),
      timestamp: formatTimestamp(start),
      viralScore,
      reactionHits,
      actionHits,
      wordCount,
      hookTitle: inferHookTitle(fullText),
      transcript: fullText.slice(0, 220),
      cues: win,
    });
  }

  candidates.sort((a, b) => b.viralScore - a.viralScore);

  const selected: ScoredViralMoment[] = [];
  for (const candidate of candidates) {
    if (selected.every((chosen) => Math.abs(chosen.startSec - candidate.startSec) >= minGapSec)) {
      selected.push(candidate);
    }
    if (selected.length >= clipCount) break;
  }

  // Fallback if captions were sparse or unavailable: pick evenly distributed windows
  if (selected.length === 0) {
    const total = Math.max(clipDurationSec * clipCount + 30, params.totalDurationSec ?? 180);
    const interval = Math.max(clipDurationSec + 5, Math.floor((total - clipDurationSec) / (clipCount + 1)));
    for (let idx = 0; idx < clipCount; idx++) {
      const startSec = Math.max(5, interval * (idx + 1));
      selected.push({
        startSec,
        timestamp: formatTimestamp(startSec),
        viralScore: 76 - idx * 3,
        reactionHits: 0,
        actionHits: 0,
        wordCount: 0,
        hookTitle: `HIGHLIGHT CLIP #${idx + 1}`,
        transcript: 'Auto-extracted highlight window (no captions detected in source video).',
        cues: [],
      });
    }
  }

  return selected;
}

export function buildSplitKaraokeAss(params: {
  cues: VttCue[];
  clipStartSec: number;
  durationSec: number;
  marginV: number;
}): { assContent: string; captionEvents: number } {
  const seen = new Set<string>();
  const segs: Array<{ start: number; end: number; text: string }> = [];

  for (const c of params.cues) {
    const key = c.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const relStart = Math.max(0, c.start - params.clipStartSec);
    const relEnd = Math.min(params.durationSec, c.end - params.clipStartSec);
    if (relEnd - relStart >= 0.2) {
      segs.push({ start: relStart, end: relEnd, text: c.text });
    }
  }

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: SplitKaraoke,Open Sans,58,&H0000E6FF,&H00FFFFFF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,7,3,2,50,50,${params.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  let captionEvents = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (!seg) continue;
    const nextStart = segs[i + 1]?.start ?? params.durationSec;
    const end = Math.min(seg.end, nextStart - 0.05);
    if (end <= seg.start + 0.15) continue;

    const words = seg.text.split(/\s+/).filter(Boolean);
    const durPerWord = (end - seg.start) / Math.max(1, words.length);
    for (let w = 0; w < words.length; w += 4) {
      const chunk = words.slice(w, w + 4);
      const cStart = seg.start + w * durPerWord;
      const cEnd = Math.min(end, cStart + chunk.length * durPerWord + 0.05);
      const cs = Math.max(8, Math.round(durPerWord * 100));
      const kText = chunk
        .map((word) => `{\\kf${cs}}${word.replace(/[{}]/g, '').toUpperCase()}`)
        .join(' ');
      lines.push(
        `Dialogue: 0,${formatAssTime(cStart)},${formatAssTime(cEnd)},SplitKaraoke,,0,0,0,,${kText}`,
      );
      captionEvents += 1;
    }
  }

  return { assContent: lines.join('\n'), captionEvents };
}

function resolveWebcamCrop(preset: WebcamCropPreset): { gameplayCrop: string; webcamCrop: string } {
  switch (preset) {
    case 'BOTTOM_LEFT':
      return { gameplayCrop: '1140:1080:520:0', webcamCrop: '420:252:20:800' };
    case 'BOTTOM_RIGHT':
      return { gameplayCrop: '1140:1080:260:0', webcamCrop: '420:252:1480:800' };
    case 'TOP_LEFT':
      return { gameplayCrop: '1140:1080:520:0', webcamCrop: '420:252:20:30' };
    case 'TOP_RIGHT':
      return { gameplayCrop: '1140:1080:260:0', webcamCrop: '420:252:1480:30' };
    case 'LEFT_MIDDLE':
    default:
      return { gameplayCrop: '1140:1080:520:0', webcamCrop: '376:226:12:452' };
  }
}

function escapeDrawtext(text: string): string {
  return text.replace(/[':\\]/g, '').slice(0, 48);
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'youtube-clip';
}

async function runYtDlp(args: string[]): Promise<string> {
  const bin = process.env['YTDLP_BIN'] ?? 'yt-dlp';
  try {
    const { stdout } = await execFileAsync(bin, ['--js-runtimes', 'node', ...args], {
      maxBuffer: 25 * 1024 * 1024,
      timeout: 120_000,
    });
    return stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExternalProviderError(
      'yt-dlp',
      `Failed to fetch YouTube stream or captions: ${message.slice(0, 320)}`,
    );
  }
}

export async function executeYoutubeViralClipping(params: {
  workspaceId: string;
  userId: string;
  input: ExecuteYoutubeViralClipRequest;
  storage: MinioStorageAdapter;
}): Promise<ExecuteYoutubeViralClipResponse> {
  const { workspaceId, userId, input, storage } = params;

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
  });
  if (!project) {
    throw new NotFoundError('Project', input.projectId);
  }

  const workDir = path.join(tmpdir(), `aicos-ytclip-${randomUUID().slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. Fetch metadata + English subtitles (--no-simulate required when combining --print with --write-auto-sub)
    const metaOut = await runYtDlp([
      '--no-simulate',
      '--skip-download',
      '--write-auto-sub',
      '--write-sub',
      '--sub-lang',
      'en',
      '--sub-format',
      'vtt',
      '--print',
      '%(id)s|||%(title)s|||%(duration)s',
      '-o',
      path.join(workDir, 'stream'),
      input.youtubeUrl,
    ]);

    const firstLine = metaOut.trim().split(/\r?\n/).find((line) => line.includes('|||')) ?? '';
    const [videoIdRaw, videoTitleRaw, durationRaw] = firstLine.split('|||');
    const videoId = (videoIdRaw ?? 'youtube').trim();
    const videoTitle = (videoTitleRaw ?? 'YouTube Viral Clip').trim();
    const totalDurationSec = Number(durationRaw) || 300;

    // 2. Parse downloaded VTT if present & score viral moments
    const files = await readdir(workDir);
    const vttFile = files.find((f) => f.endsWith('.vtt'));
    const cues = vttFile
      ? parseVttCues(await readFile(path.join(workDir, vttFile), 'utf8'))
      : [];

    const topClips = detectAndScoreViralMoments({
      cues,
      clipDurationSec: input.clipDurationSec,
      clipCount: input.clipCount,
      totalDurationSec,
    });

    // 3. Resolve direct video + audio stream URLs once
    const urlsRaw = (
      await runYtDlp([
        '-f',
        'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]',
        '-g',
        input.youtubeUrl,
      ])
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    const videoUrl = urlsRaw[0];
    const audioUrl = urlsRaw[1] ?? urlsRaw[0];
    if (!videoUrl || !audioUrl) {
      throw new ExternalProviderError('yt-dlp', 'Could not resolve direct media stream URLs');
    }

    const storageCfg = storage.getConfig();
    const renderedClips: YoutubeViralClipItem[] = [];
    const safeBadge = escapeDrawtext(input.badgeLabel);
    const { gameplayCrop, webcamCrop } = resolveWebcamCrop(input.webcamPreset);

    // 4. Render each scored viral moment, upload to MinIO, persist Asset
    for (let idx = 0; idx < topClips.length; idx++) {
      const clip = topClips[idx];
      if (!clip) continue;
      const rank = idx + 1;

      const assPath = path.join(workDir, `clip-${rank}.ass`);
      const mp4Path = path.join(workDir, `clip-${rank}.mp4`);
      const thumbPath = path.join(workDir, `clip-${rank}.png`);

      const marginV = input.layout === 'SPLIT_WEBCAM_BOTTOM' ? 765 : 260;
      const { assContent, captionEvents } = buildSplitKaraokeAss({
        cues: clip.cues,
        clipStartSec: clip.startSec,
        durationSec: input.clipDurationSec,
        marginV,
      });
      await writeFile(assPath, assContent, 'utf8');

      const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const safeTitle = escapeDrawtext(clip.hookTitle);

      const videoChain =
        input.layout === 'SPLIT_WEBCAM_BOTTOM'
          ? [
              '[0:v]split=2[g_src][c_src]',
              `[g_src]crop=${gameplayCrop},scale=1080:1140:force_original_aspect_ratio=increase,crop=1080:1140[gameplay]`,
              `[c_src]crop=${webcamCrop},scale=1080:780:force_original_aspect_ratio=increase,crop=1080:780[webcam]`,
              '[gameplay][webcam]vstack=inputs=2[stacked]',
              `[stacked]drawbox=x=0:y=0:w=1080:h=168:color=black@0.48:t=fill` +
                `,drawbox=x=40:y=42:w=240:h=56:color=${input.accentColor}:t=fill` +
                `,drawbox=x=780:y=42:w=260:h=56:color=black@0.75:t=fill` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='${safeBadge}':fontcolor=white:fontsize=34:x=76:y=54` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='VIRAL ${clip.viralScore}/100':fontcolor=#FFE600:fontsize=32:x=806:y=55` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='${safeTitle}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=112` +
                `,drawbox=x=0:y=1136:w=1080:h=8:color=${input.accentColor}:t=fill` +
                `,ass=${safeAssPath}` +
                `,drawbox=x=0:y=1906:w='iw*t/${input.clipDurationSec}':h=14:color=${input.accentColor}:t=fill[vout]`,
            ]
          : [
              `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920` +
                `,drawbox=x=0:y=0:w=1080:h=168:color=black@0.48:t=fill` +
                `,drawbox=x=40:y=42:w=240:h=56:color=${input.accentColor}:t=fill` +
                `,drawbox=x=780:y=42:w=260:h=56:color=black@0.75:t=fill` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='${safeBadge}':fontcolor=white:fontsize=34:x=76:y=54` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='VIRAL ${clip.viralScore}/100':fontcolor=#FFE600:fontsize=32:x=806:y=55` +
                `,drawtext=fontfile=${DEFAULT_FONT_PATH}:text='${safeTitle}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=112` +
                `,ass=${safeAssPath}` +
                `,drawbox=x=0:y=1906:w='iw*t/${input.clipDurationSec}':h=14:color=${input.accentColor}:t=fill[vout]`,
            ];

      const filterComplex = [
        ...videoChain,
        '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]',
      ].join(';');

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(clip.startSec),
          '-t',
          String(input.clipDurationSec),
          '-i',
          videoUrl,
          '-ss',
          String(clip.startSec),
          '-t',
          String(input.clipDurationSec),
          '-i',
          audioUrl,
          '-filter_complex',
          filterComplex,
          '-map',
          '[vout]',
          '-map',
          '[aout]',
          '-r',
          '30',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-preset',
          'fast',
          '-crf',
          '21',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-shortest',
          mp4Path,
        ],
        { maxBuffer: 20 * 1024 * 1024, timeout: 180_000 },
      );

      await execFileAsync(
        'ffmpeg',
        ['-y', '-ss', String(Math.min(6, Math.floor(input.clipDurationSec / 3))), '-i', mp4Path, '-vframes', '1', thumbPath],
        { timeout: 30_000 },
      );

      // Verify rendered clip via ffprobe before uploading to MinIO
      const probe = await probeVideoFile(mp4Path);
      if (probe.probeMode === 'ffprobe' && !probe.browserCompatible) {
        throw new ExternalProviderError(
          'ffmpeg',
          `Clip #${rank} failed browser compatibility verification: ${probe.issues.join('; ')}`,
        );
      }

      const mp4Buf = await readFile(mp4Path);
      const thumbBuf = await readFile(thumbPath);

      const fileName = `${sanitizeSlug(videoTitle)}-clip-${rank}-score${clip.viralScore}.mp4`;
      const storageKey = `${workspaceId}/${project.id}/youtube-clips/${randomUUID()}-${fileName}`;
      const thumbKey = `${workspaceId}/${project.id}/youtube-clips/${randomUUID()}-thumb-${rank}.png`;

      await storage.putObject({
        bucket: storageCfg.rawBucket,
        storageKey,
        body: new Uint8Array(mp4Buf),
        contentType: 'video/mp4',
      });
      const verifiedObj = await storage.headObject({
        bucket: storageCfg.rawBucket,
        storageKey,
      });
      if (!verifiedObj.exists || verifiedObj.sizeBytes <= 0) {
        throw new ExternalProviderError(
          'MinIO',
          `Clip #${rank} could not be verified after upload (${storageKey})`,
        );
      }
      await storage.putObject({
        bucket: storageCfg.derivativesBucket,
        storageKey: thumbKey,
        body: new Uint8Array(thumbBuf),
        contentType: 'image/png',
      });

      const checksumSha256 = createHash('sha256').update(mp4Buf).digest('hex');

      const asset = await prisma.asset.create({
        data: {
          workspaceId,
          projectId: project.id,
          assetType: 'VIDEO',
          status: 'READY',
          originalName: fileName,
          folderPath: input.folderPath,
          mimeType: 'video/mp4',
          sizeBytes: BigInt(mp4Buf.byteLength),
          checksumSha256,
          bucketName: storageCfg.rawBucket,
          storageKey,
          durationSec: input.clipDurationSec,
          width: 1080,
          height: 1920,
          fps: 30,
          aiSummary: `[Viral Score ${clip.viralScore}/100] ${clip.hookTitle} — ${clip.transcript}`,
          tags: ['youtube-viral-clip', input.layout.toLowerCase(), `score-${clip.viralScore}`],
          aiMetadataJson: {
            sourceYoutubeUrl: input.youtubeUrl,
            sourceVideoId: videoId,
            sourceVideoTitle: videoTitle,
            startSec: clip.startSec,
            timestamp: clip.timestamp,
            viralScore: clip.viralScore,
            hookTitle: clip.hookTitle,
            layout: input.layout,
            webcamPreset: input.webcamPreset,
            captionEvents,
            thumbnailKey: thumbKey,
          },
          derivatives: {
            create: {
              derivativeType: 'THUMBNAIL',
              storageKey: thumbKey,
              mimeType: 'image/png',
              sizeBytes: BigInt(thumbBuf.byteLength),
            },
          },
        },
      });

      const downloadUrl = storage.createPresignedUrl({
        method: 'GET',
        bucket: storageCfg.rawBucket,
        storageKey,
        expiresInSec: 3600,
        usePublicEndpoint: true,
      });
      const thumbnailUrl = storage.createPresignedUrl({
        method: 'GET',
        bucket: storageCfg.derivativesBucket,
        storageKey: thumbKey,
        expiresInSec: 3600,
        usePublicEndpoint: true,
      });

      const streamUrl = buildAssetStreamUrl({
        userId,
        workspaceId,
        assetId: asset.id,
      });

      renderedClips.push({
        rank,
        assetId: asset.id,
        fileName,
        streamUrl,
        downloadUrl,
        thumbnailUrl,
        startSec: clip.startSec,
        timestamp: clip.timestamp,
        durationSec: input.clipDurationSec,
        viralScore: clip.viralScore,
        hookTitle: clip.hookTitle,
        transcript: clip.transcript,
        captionEvents,
        sizeBytes: mp4Buf.byteLength,
        layout: input.layout,
      });
    }

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'YOUTUBE_VIRAL_CLIPS_GENERATED',
        entityType: 'Project',
        entityId: project.id,
        detailsJson: {
          youtubeUrl: input.youtubeUrl,
          videoId,
          videoTitle,
          layout: input.layout,
          clipsCreated: renderedClips.length,
        },
      },
    });

    return {
      projectId: project.id,
      youtubeUrl: input.youtubeUrl,
      videoId,
      videoTitle,
      layout: input.layout,
      clips: renderedClips,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
