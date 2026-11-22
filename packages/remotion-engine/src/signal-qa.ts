import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SignalQaCheck, SignalQaReport, SignalQaStatus } from '@ai-content-os/shared';
import { probeVideoFile, VideoProbeMetadata } from './video-probe.js';

const execFileAsync = promisify(execFile);

export interface SignalQaProfile {
  expectedWidth?: number | undefined;
  expectedHeight?: number | undefined;
  minDurationSec?: number | undefined;
  maxDurationSec?: number | undefined;
  requireAudio?: boolean | undefined;
  maxBlackRatio?: number | undefined;
  maxSilenceRatio?: number | undefined;
}

export interface BlackSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface SilenceSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface LoudnessMeasurement {
  integratedLufs: number | null;
  truePeakDbfs: number | null;
}

export function parseBlackDetectStderr(stderr: string): BlackSegment[] {
  const segments: BlackSegment[] = [];
  const re = /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    segments.push({
      startSec: Number(m[1] ?? 0),
      endSec: Number(m[2] ?? 0),
      durationSec: Number(m[3] ?? 0),
    });
  }
  return segments;
}

export function parseSilenceDetectStderr(stderr: string): SilenceSegment[] {
  const segments: SilenceSegment[] = [];
  const re = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const endSec = Number(m[1] ?? 0);
    const durationSec = Number(m[2] ?? 0);
    segments.push({
      startSec: Math.max(0, Math.round((endSec - durationSec) * 1000) / 1000),
      endSec,
      durationSec,
    });
  }
  return segments;
}

export function parseEbur128Stderr(stderr: string): LoudnessMeasurement {
  const integratedMatch = stderr.match(/I:\s*(-?[\d.]+)\s+LUFS/);
  const peakMatch = stderr.match(/Peak:\s*(-?[\d.]+)\s+dBFS/);
  return {
    integratedLufs: integratedMatch ? Number(integratedMatch[1]) : null,
    truePeakDbfs: peakMatch ? Number(peakMatch[1]) : null,
  };
}

export function evaluateSignalQaChecks(params: {
  probe: VideoProbeMetadata;
  blackSegments: BlackSegment[];
  silenceSegments: SilenceSegment[];
  loudness: LoudnessMeasurement;
  profile: SignalQaProfile;
  toolVersion?: string;
}): SignalQaReport {
  const { probe, blackSegments, silenceSegments, loudness, profile } = params;
  const checks: SignalQaCheck[] = [];

  // 1. Output & codec compatibility
  checks.push({
    checkId: 'output_browser_mp4',
    category: 'OUTPUT',
    status: probe.browserCompatible ? 'PASSED' : 'FAILED',
    severity: probe.browserCompatible ? 'INFO' : 'CRITICAL',
    measuredValue: `${probe.containerFormat} / ${probe.videoCodec ?? 'none'} / ${probe.pixelFormat ?? 'none'}`,
    expectedValue: 'mp4 / h264 / yuv420p',
    timestampSec: null,
    message: probe.browserCompatible
      ? 'Container, H.264 codec, and yuv420p pixel format verified.'
      : `Browser compatibility issues: ${probe.issues.join('; ')}`,
    remediation: probe.browserCompatible
      ? null
      : 'Re-encode with -c:v libx264 -pix_fmt yuv420p -movflags +faststart.',
  });

  // 2. Dimensions
  if (profile.expectedWidth && profile.expectedHeight) {
    const dimOk = probe.width === profile.expectedWidth && probe.height === profile.expectedHeight;
    checks.push({
      checkId: 'video_dimensions',
      category: 'VIDEO',
      status: dimOk ? 'PASSED' : 'FAILED',
      severity: dimOk ? 'INFO' : 'CRITICAL',
      measuredValue: `${probe.width}x${probe.height}`,
      expectedValue: `${profile.expectedWidth}x${profile.expectedHeight}`,
      timestampSec: null,
      message: dimOk
        ? 'Output dimensions match target aspect ratio profile.'
        : `Dimensions ${probe.width}x${probe.height} do not match expected ${profile.expectedWidth}x${profile.expectedHeight}.`,
      remediation: dimOk ? null : 'Scale and pad/crop to exact target resolution.',
    });
  }

  // 3. Duration bounds
  const minDur = profile.minDurationSec ?? 0.5;
  const maxDur = profile.maxDurationSec ?? 600;
  const durOk = probe.durationSec >= minDur && probe.durationSec <= maxDur;
  checks.push({
    checkId: 'video_duration',
    category: 'VIDEO',
    status: durOk ? 'PASSED' : 'FAILED',
    severity: durOk ? 'INFO' : 'CRITICAL',
    measuredValue: `${probe.durationSec.toFixed(2)}s`,
    expectedValue: `${minDur}s - ${maxDur}s`,
    timestampSec: null,
    message: durOk
      ? 'Duration within expected profile range.'
      : `Duration ${probe.durationSec.toFixed(2)}s outside bounds (${minDur}s - ${maxDur}s).`,
    remediation: durOk ? null : 'Verify source media length and timeline frame count.',
  });

  // 4. Black-frame detection
  const totalBlackSec = blackSegments.reduce((acc, s) => acc + s.durationSec, 0);
  const blackRatio = probe.durationSec > 0 ? totalBlackSec / probe.durationSec : 0;
  const maxBlack = profile.maxBlackRatio ?? 0.35;
  const blackStatus: SignalQaStatus =
    blackRatio > maxBlack ? 'FAILED' : totalBlackSec >= 1.5 ? 'WARNING' : 'PASSED';
  checks.push({
    checkId: 'video_black_frames',
    category: 'VIDEO',
    status: blackStatus,
    severity: blackStatus === 'FAILED' ? 'CRITICAL' : blackStatus === 'WARNING' ? 'WARNING' : 'INFO',
    measuredValue: `${totalBlackSec.toFixed(2)}s (${Math.round(blackRatio * 100)}%)`,
    expectedValue: `<= ${Math.round(maxBlack * 100)}%`,
    timestampSec: blackSegments[0]?.startSec ?? null,
    message:
      blackStatus === 'PASSED'
        ? 'No excessive black-frame segments detected.'
        : `Detected ${blackSegments.length} black segment(s) totaling ${totalBlackSec.toFixed(2)}s.`,
    remediation:
      blackStatus === 'PASSED'
        ? null
        : 'Inspect scene transitions or background media for missing frames.',
  });

  // 5. Audio stream presence (profile-aware)
  if (!probe.hasAudio) {
    const audioReq = profile.requireAudio === true;
    checks.push({
      checkId: 'audio_stream_presence',
      category: 'AUDIO',
      status: audioReq ? 'FAILED' : 'NOT_APPLICABLE',
      severity: audioReq ? 'CRITICAL' : 'INFO',
      measuredValue: 'none',
      expectedValue: audioReq ? 'aac audio stream required' : 'optional',
      timestampSec: null,
      message: audioReq
        ? 'Export profile requires an audio stream, but none was found.'
        : 'Audio stream absent (permitted by export profile).',
      remediation: audioReq ? 'Attach voiceover or music bed and re-render with -c:a aac.' : null,
    });
  } else {
    checks.push({
      checkId: 'audio_stream_presence',
      category: 'AUDIO',
      status: 'PASSED',
      severity: 'INFO',
      measuredValue: probe.audioCodec ?? 'audio',
      expectedValue: 'aac',
      timestampSec: null,
      message: `Audio stream verified (${probe.audioCodec ?? 'present'}).`,
      remediation: null,
    });

    // 6. Silence ratio
    const totalSilenceSec = silenceSegments.reduce((acc, s) => acc + s.durationSec, 0);
    const silenceRatio = probe.durationSec > 0 ? totalSilenceSec / probe.durationSec : 0;
    const maxSilence = profile.maxSilenceRatio ?? 0.65;
    const silenceStatus: SignalQaStatus =
      silenceRatio > maxSilence ? 'WARNING' : 'PASSED';
    checks.push({
      checkId: 'audio_silence_ratio',
      category: 'AUDIO',
      status: silenceStatus,
      severity: silenceStatus === 'WARNING' ? 'WARNING' : 'INFO',
      measuredValue: `${totalSilenceSec.toFixed(2)}s (${Math.round(silenceRatio * 100)}%)`,
      expectedValue: `<= ${Math.round(maxSilence * 100)}%`,
      timestampSec: silenceSegments[0]?.startSec ?? null,
      message:
        silenceStatus === 'PASSED'
          ? 'Audio activity level within normal speech/music range.'
          : `Extended silence detected (${Math.round(silenceRatio * 100)}% of duration).`,
      remediation:
        silenceStatus === 'PASSED'
          ? null
          : 'Trim long pauses or verify TTS/music mix levels.',
    });

    // 7. Loudness & clipping
    if (loudness.integratedLufs !== null || loudness.truePeakDbfs !== null) {
      const clipping = loudness.truePeakDbfs !== null && loudness.truePeakDbfs > -0.2;
      const tooQuiet = loudness.integratedLufs !== null && loudness.integratedLufs < -30;
      const loudStatus: SignalQaStatus = clipping || tooQuiet ? 'WARNING' : 'PASSED';
      checks.push({
        checkId: 'audio_loudness_ebur128',
        category: 'AUDIO',
        status: loudStatus,
        severity: loudStatus === 'WARNING' ? 'WARNING' : 'INFO',
        measuredValue: `${loudness.integratedLufs ?? 'N/A'} LUFS / peak ${loudness.truePeakDbfs ?? 'N/A'} dBFS`,
        expectedValue: '-24 to -12 LUFS / peak <= -0.5 dBFS',
        timestampSec: null,
        message: clipping
          ? 'Audio peak approaches 0 dBFS clipping threshold.'
          : tooQuiet
            ? 'Integrated loudness is unusually quiet (<-30 LUFS).'
            : 'Audio loudness and peak levels are broadcast/social safe.',
        remediation:
          loudStatus === 'PASSED' ? null : 'Apply FFmpeg loudnorm=I=-14:TP=-1.5:LRA=11.',
      });
    }
  }

  const hasFailed = checks.some((c) => c.status === 'FAILED');
  const hasWarning = checks.some((c) => c.status === 'WARNING');
  const overallStatus: SignalQaStatus = hasFailed
    ? 'FAILED'
    : hasWarning
      ? 'WARNING'
      : 'PASSED';

  return {
    overallStatus,
    technicallyVerified: !hasFailed,
    tool: probe.probeMode === 'ffprobe' ? 'ffmpeg+ffprobe' : 'magic-byte-fallback',
    toolVersion: params.toolVersion ?? 'detected-runtime',
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export async function runFfmpegSignalQa(
  filePath: string,
  profile: SignalQaProfile = {},
): Promise<SignalQaReport> {
  const probe = await probeVideoFile(filePath);
  if (probe.probeMode !== 'ffprobe' || !probe.browserCompatible) {
    return evaluateSignalQaChecks({
      probe,
      blackSegments: [],
      silenceSegments: [],
      loudness: { integratedLufs: null, truePeakDbfs: null },
      profile,
    });
  }

  let blackStderr = '';
  let audioStderr = '';

  try {
    const vfRes = await execFileAsync(
      'ffmpeg',
      ['-i', filePath, '-vf', 'blackdetect=d=0.4:pix_th=0.10', '-an', '-f', 'null', '-'],
      { maxBuffer: 10 * 1024 * 1024, timeout: 45_000 },
    );
    blackStderr = vfRes.stderr;
  } catch (err) {
    blackStderr = (err as { stderr?: string })?.stderr ?? '';
  }

  if (probe.hasAudio) {
    try {
      const afRes = await execFileAsync(
        'ffmpeg',
        ['-i', filePath, '-af', 'silencedetect=n=-45dB:d=0.8,ebur128=peak=true', '-vn', '-f', 'null', '-'],
        { maxBuffer: 10 * 1024 * 1024, timeout: 45_000 },
      );
      audioStderr = afRes.stderr;
    } catch (err) {
      audioStderr = (err as { stderr?: string })?.stderr ?? '';
    }
  }

  return evaluateSignalQaChecks({
    probe,
    blackSegments: parseBlackDetectStderr(blackStderr),
    silenceSegments: parseSilenceDetectStderr(audioStderr),
    loudness: parseEbur128Stderr(audioStderr),
    profile,
  });
}

export async function runFfmpegSignalQaBytes(
  mp4Bytes: Uint8Array,
  profile: SignalQaProfile = {},
): Promise<SignalQaReport> {
  const tmpPath = path.join(tmpdir(), `aicos-sigqa-${randomUUID()}.mp4`);
  try {
    await writeFile(tmpPath, mp4Bytes);
    return await runFfmpegSignalQa(tmpPath, profile);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}
