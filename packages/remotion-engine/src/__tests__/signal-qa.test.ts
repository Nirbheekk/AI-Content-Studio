import { describe, expect, it } from 'vitest';
import {
  evaluateSignalQaChecks,
  parseBlackDetectStderr,
  parseEbur128Stderr,
  parseSilenceDetectStderr,
} from '../signal-qa.js';
import type { VideoProbeMetadata } from '../video-probe.js';

const VALID_PROBE: VideoProbeMetadata = {
  probeMode: 'ffprobe',
  containerFormat: 'mov,mp4,m4a,3gp,3g2,mj2',
  videoCodec: 'h264',
  audioCodec: 'aac',
  pixelFormat: 'yuv420p',
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 15,
  sizeBytes: 650000,
  hasAudio: true,
  browserCompatible: true,
  issues: [],
};

describe('Stage 2E — FFmpeg Signal QA Engine', () => {
  it('passes valid H.264/yuv420p/AAC MP4 with normal loudness', () => {
    const report = evaluateSignalQaChecks({
      probe: VALID_PROBE,
      blackSegments: [],
      silenceSegments: [],
      loudness: { integratedLufs: -14.2, truePeakDbfs: -1.5 },
      profile: { expectedWidth: 1080, expectedHeight: 1920, requireAudio: true },
    });
    expect(report.overallStatus).toBe('PASSED');
    expect(report.technicallyVerified).toBe(true);
  });

  it('fails wrong dimensions and required missing audio, but marks optional missing audio NOT_APPLICABLE', () => {
    const silentProbe: VideoProbeMetadata = {
      ...VALID_PROBE,
      width: 640,
      height: 480,
      hasAudio: false,
      audioCodec: null,
    };

    const strictReport = evaluateSignalQaChecks({
      probe: silentProbe,
      blackSegments: [],
      silenceSegments: [],
      loudness: { integratedLufs: null, truePeakDbfs: null },
      profile: { expectedWidth: 1080, expectedHeight: 1920, requireAudio: true },
    });
    expect(strictReport.overallStatus).toBe('FAILED');
    expect(strictReport.technicallyVerified).toBe(false);
    expect(strictReport.checks.find((c) => c.checkId === 'video_dimensions')?.status).toBe('FAILED');
    expect(strictReport.checks.find((c) => c.checkId === 'audio_stream_presence')?.status).toBe('FAILED');

    const optionalAudioReport = evaluateSignalQaChecks({
      probe: { ...VALID_PROBE, hasAudio: false, audioCodec: null },
      blackSegments: [],
      silenceSegments: [],
      loudness: { integratedLufs: null, truePeakDbfs: null },
      profile: { expectedWidth: 1080, expectedHeight: 1920, requireAudio: false },
    });
    expect(optionalAudioReport.overallStatus).toBe('PASSED');
    expect(optionalAudioReport.checks.find((c) => c.checkId === 'audio_stream_presence')?.status).toBe('NOT_APPLICABLE');
  });

  it('parses FFmpeg blackdetect, silencedetect, and ebur128 stderr output', () => {
    const blacks = parseBlackDetectStderr(
      '[blackdetect @ 0x1] black_start:0 black_end:6.5 black_duration:6.5',
    );
    expect(blacks).toHaveLength(1);
    expect(blacks[0]?.durationSec).toBe(6.5);

    const silences = parseSilenceDetectStderr(
      '[silencedetect @ 0x2] silence_end: 12.0 | silence_duration: 11.0',
    );
    expect(silences).toHaveLength(1);
    expect(silences[0]?.durationSec).toBe(11.0);

    const loud = parseEbur128Stderr('Summary:\n  I: -14.1 LUFS\n  Peak: -0.1 dBFS');
    expect(loud.integratedLufs).toBe(-14.1);
    expect(loud.truePeakDbfs).toBe(-0.1);

    const qa = evaluateSignalQaChecks({
      probe: VALID_PROBE,
      blackSegments: blacks,
      silenceSegments: silences,
      loudness: loud,
      profile: { maxBlackRatio: 0.3, maxSilenceRatio: 0.5 },
    });
    expect(qa.overallStatus).toBe('FAILED');
    expect(qa.checks.find((c) => c.checkId === 'video_black_frames')?.status).toBe('FAILED');
    expect(qa.checks.find((c) => c.checkId === 'audio_silence_ratio')?.status).toBe('WARNING');
    expect(qa.checks.find((c) => c.checkId === 'audio_loudness_ebur128')?.status).toBe('WARNING');
  });
});
