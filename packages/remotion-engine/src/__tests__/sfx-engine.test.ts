import { describe, expect, it } from 'vitest';
import {
  buildAutoSfxCuesForCuts,
  buildSfxMixFilterGraph,
  SFX_PRESETS,
} from '../sfx-engine.js';

describe('Procedural SFX Sound Engine', () => {
  it('exposes all 6 commercially safe procedural SFX presets', () => {
    expect(Object.keys(SFX_PRESETS)).toEqual([
      'WHOOSH',
      'POP',
      'RISER',
      'BOOM',
      'CHIME',
      'GLITCH',
    ]);
  });

  it('builds a valid FFmpeg filter_complex graph with exact millisecond delays and loudnorm', () => {
    const graph = buildSfxMixFilterGraph({
      cues: [
        { preset: 'POP', atSec: 0.2 },
        { preset: 'WHOOSH', atSec: 5.75, gainDb: -8 },
        { preset: 'BOOM', atSec: 22.5 },
      ],
      baseAudioLabel: 'ac',
      outputLabel: 'aout',
    });

    expect(graph.appliedCueCount).toBe(3);
    expect(graph.outputLabel).toBe('aout');
    const joined = graph.filterParts.join(';');
    expect(joined).toContain('adelay=200|200');
    expect(joined).toContain('adelay=5750|5750');
    expect(joined).toContain('adelay=22500|22500');
    expect(joined).toContain('volume=-8dB');
    expect(joined).toContain('amix=inputs=4:duration=first:dropout_transition=0:normalize=0');
    expect(joined).toContain('loudnorm=I=-14:TP=-1.5:LRA=11[aout]');
  });

  it('generates automatic transition cues aligned to segment boundaries', () => {
    const cues = buildAutoSfxCuesForCuts([5.8, 17.4, 21.0]);
    expect(cues).toHaveLength(3);
    expect(cues[0]?.preset).toBe('POP');
    expect(cues[1]?.preset).toBe('WHOOSH');
    expect(cues[1]?.atSec).toBeCloseTo(5.68, 2);
    expect(cues[2]?.preset).toBe('GLITCH');
  });
});
