import { describe, expect, it } from 'vitest';
import { parseFfprobeJson, probeVideoBytes } from '../video-probe.js';

describe('Video Probe — Browser MP4 Compatibility Validation', () => {
  it('accepts valid H.264 yuv420p + AAC MP4', () => {
    const raw = JSON.stringify({
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '15.200', size: '670552' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          pix_fmt: 'yuv420p',
          width: 1080,
          height: 1920,
          avg_frame_rate: '30/1',
        },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    });
    const res = parseFfprobeJson(raw, 670552);
    expect(res.browserCompatible).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.width).toBe(1080);
    expect(res.height).toBe(1920);
    expect(res.fps).toBe(30);
    expect(res.hasAudio).toBe(true);
  });

  it('accepts valid silent H.264 yuv420p MP4 without audio stream', () => {
    const raw = JSON.stringify({
      format: { format_name: 'mp4', duration: '10.0', size: '120000' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          pix_fmt: 'yuv420p',
          width: 1920,
          height: 1080,
          r_frame_rate: '24/1',
        },
      ],
    });
    const res = parseFfprobeJson(raw, 120000);
    expect(res.browserCompatible).toBe(true);
    expect(res.hasAudio).toBe(false);
    expect(res.audioCodec).toBeNull();
  });

  it('rejects non-yuv420p pixel format and non-h264 codec', () => {
    const raw = JSON.stringify({
      format: { format_name: 'mp4', duration: '8.0', size: '50000' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'vp9',
          pix_fmt: 'yuv444p',
          width: 1080,
          height: 1920,
        },
      ],
    });
    const res = parseFfprobeJson(raw, 50000);
    expect(res.browserCompatible).toBe(false);
    expect(res.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects non-MP4 buffers missing ISO BMFF ftyp header', async () => {
    const res = await probeVideoBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(res.browserCompatible).toBe(false);
    expect(res.issues[0]).toContain('ftyp');
  });
});
