import { describe, expect, it } from 'vitest';
import {
  buildSplitKaraokeAss,
  detectAndScoreViralMoments,
  parseVttCues,
} from '../services/youtube-viral-clipper.js';

const SAMPLE_VTT = `WEBVTT
Kind: captions
Language: en

00:00:30.000 --> 00:00:34.000
Wait bro oh my god no way they are everywhere careful with the police car

00:00:34.200 --> 00:00:38.500
Shoot the helicopter and run this GTA mission is insane I am screaming

00:00:38.800 --> 00:00:43.000
Wait wait we can finally win this boss fight and save the car right now

00:05:10.000 --> 00:05:14.000
Just walking around the map looking at buildings and taking a slow break

00:05:14.500 --> 00:05:18.000
Nothing much happening here just checking the menu and settings slowly

00:05:18.500 --> 00:05:22.000
Okay let us keep walking down the street for a little while longer
`;

describe('YouTube Viral Clipper — VTT Parser, Scoring & ASS Karaoke', () => {
  it('parses VTT blocks into clean cues', () => {
    const cues = parseVttCues(SAMPLE_VTT);
    expect(cues).toHaveLength(6);
    expect(cues[0]?.start).toBe(30);
    expect(cues[0]?.text).toContain('oh my god');
  });

  it('scores high-energy moments higher and returns non-overlapping clips', () => {
    const cues = parseVttCues(SAMPLE_VTT);
    const moments = detectAndScoreViralMoments({
      cues,
      clipDurationSec: 22,
      clipCount: 2,
      totalDurationSec: 600,
    });

    expect(moments.length).toBe(2);
    expect(moments[0]?.startSec).toBe(30);
    expect(moments[0]?.viralScore).toBeGreaterThan(moments[1]?.viralScore ?? 0);
    expect(moments[0]?.hookTitle).toBe('THEY ARE EVERYWHERE!');
    expect(Math.abs((moments[0]?.startSec ?? 0) - (moments[1]?.startSec ?? 0))).toBeGreaterThanOrEqual(90);
  });

  it('generates ASS karaoke with \\kf timing tags and seam MarginV', () => {
    const cues = parseVttCues(SAMPLE_VTT).slice(0, 2);
    const { assContent, captionEvents } = buildSplitKaraokeAss({
      cues,
      clipStartSec: 30,
      durationSec: 22,
      marginV: 765,
    });

    expect(captionEvents).toBeGreaterThan(0);
    expect(assContent).toContain('Style: SplitKaraoke');
    expect(assContent).toContain(',765,1');
    expect(assContent).toContain('{\\kf');
  });
});
