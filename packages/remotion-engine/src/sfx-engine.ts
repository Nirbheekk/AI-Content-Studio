import { spawnSync } from 'node:child_process';

export type SfxPresetId = 'WHOOSH' | 'POP' | 'RISER' | 'BOOM' | 'CHIME' | 'GLITCH';

export interface SfxPresetSpec {
  id: SfxPresetId;
  label: string;
  durationSec: number;
  defaultGainDb: number;
  useCase: string;
  /** FFmpeg lavfi audio filter expression producing mono/stereo 48kHz audio */
  lavfiExpr: string;
}

export interface SfxCue {
  id?: string | undefined;
  preset: SfxPresetId;
  /** Timeline timestamp in seconds where the SFX triggers */
  atSec: number;
  /** Optional gain override in dB (negative values duck under speech, e.g. -10) */
  gainDb?: number | undefined;
}

export const SFX_PRESETS: Readonly<Record<SfxPresetId, SfxPresetSpec>> = {
  WHOOSH: {
    id: 'WHOOSH',
    label: 'Transition Whoosh',
    durationSec: 0.35,
    defaultGainDb: -10,
    useCase: 'Fast scene cut or caption transition',
    lavfiExpr:
      'anoisesrc=color=pink:duration=0.35:sample_rate=48000,bandpass=f=900:width_type=h:w=1400,afade=t=in:st=0:d=0.12,afade=t=out:st=0.16:d=0.19',
  },
  POP: {
    id: 'POP',
    label: 'Caption Pop',
    durationSec: 0.14,
    defaultGainDb: -11,
    useCase: 'Hook reveal, keyword pop, or UI callout',
    lavfiExpr:
      'sine=frequency=520:duration=0.14:sample_rate=48000,asetrate=48000*1.25,aresample=48000,afade=t=in:st=0:d=0.01,afade=t=out:st=0.03:d=0.10',
  },
  RISER: {
    id: 'RISER',
    label: 'Tension Riser',
    durationSec: 1.2,
    defaultGainDb: -12,
    useCase: 'Build-up right before a twist or punchline',
    lavfiExpr:
      'anoisesrc=color=white:duration=1.2:sample_rate=48000,highpass=f=600,lowpass=f=3200,afade=t=in:st=0:d=1.05:curve=exp,afade=t=out:st=1.10:d=0.10',
  },
  BOOM: {
    id: 'BOOM',
    label: 'Cinematic Sub Impact',
    durationSec: 0.65,
    defaultGainDb: -9,
    useCase: 'Dramatic reveal, explosion beat, or punchline landing',
    lavfiExpr:
      'sine=frequency=68:duration=0.65:sample_rate=48000,afade=t=in:st=0:d=0.015,afade=t=out:st=0.08:d=0.57:curve=exp',
  },
  CHIME: {
    id: 'CHIME',
    label: 'Insight Chime',
    durationSec: 0.45,
    defaultGainDb: -13,
    useCase: 'Key takeaway, tip, or on-screen highlight',
    lavfiExpr:
      'sine=frequency=1046:duration=0.45:sample_rate=48000,afade=t=in:st=0:d=0.01,afade=t=out:st=0.06:d=0.39:curve=exp',
  },
  GLITCH: {
    id: 'GLITCH',
    label: 'Digital Glitch Cut',
    durationSec: 0.22,
    defaultGainDb: -11,
    useCase: 'Tech/laptop moment, script edit, or comedic record-scratch cut',
    lavfiExpr:
      'anoisesrc=color=white:duration=0.22:sample_rate=48000,bandpass=f=2200:width_type=h:w=1800,tremolo=f=38:d=0.9,afade=t=out:st=0.12:d=0.10',
  },
};

export interface SfxFilterGraphResult {
  filterParts: string[];
  outputLabel: string;
  appliedCueCount: number;
}

/**
 * Builds a deterministic FFmpeg filter_complex subgraph that synthesizes each SFX cue,
 * delays it to its exact millisecond timestamp, ducks it cleanly under speech, and mixes
 * with the base audio stream followed by -14 LUFS broadcast loudness normalization.
 */
export function buildSfxMixFilterGraph(params: {
  cues: readonly SfxCue[];
  baseAudioLabel?: string | undefined;
  outputLabel?: string | undefined;
  applyLoudnorm?: boolean | undefined;
}): SfxFilterGraphResult {
  const baseLabel = params.baseAudioLabel ?? 'ac';
  const outLabel = params.outputLabel ?? 'aout';
  const applyLoudnorm = params.applyLoudnorm ?? true;

  const validCues = params.cues
    .filter((c) => Number.isFinite(c.atSec) && c.atSec >= 0 && Boolean(SFX_PRESETS[c.preset]))
    .sort((a, b) => a.atSec - b.atSec);

  if (validCues.length === 0) {
    return {
      filterParts: applyLoudnorm
        ? [`[${baseLabel}]loudnorm=I=-14:TP=-1.5:LRA=11[${outLabel}]`]
        : [`[${baseLabel}]acopy[${outLabel}]`],
      outputLabel: outLabel,
      appliedCueCount: 0,
    };
  }

  const filterParts: string[] = [];
  const mixInputs: string[] = [`[${baseLabel}]`];

  validCues.forEach((cue, idx) => {
    const spec = SFX_PRESETS[cue.preset];
    const delayMs = Math.max(0, Math.round(cue.atSec * 1000));
    const gainDb = cue.gainDb ?? spec.defaultGainDb;
    const label = `sfx_${idx}`;
    filterParts.push(
      `${spec.lavfiExpr},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${gainDb}dB,adelay=${delayMs}|${delayMs}[${label}]`,
    );
    mixInputs.push(`[${label}]`);
  });

  const mixedLabel = applyLoudnorm ? 'amixed_sfx' : outLabel;
  filterParts.push(
    `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[${mixedLabel}]`,
  );

  if (applyLoudnorm) {
    filterParts.push(`[${mixedLabel}]loudnorm=I=-14:TP=-1.5:LRA=11[${outLabel}]`);
  }

  return {
    filterParts,
    outputLabel: outLabel,
    appliedCueCount: validCues.length,
  };
}

/**
 * Generates an automatic transition & emphasis SFX cue sheet from segment cut boundaries.
 */
export function buildAutoSfxCuesForCuts(
  segmentDurationsSec: readonly number[],
): SfxCue[] {
  const cues: SfxCue[] = [{ preset: 'POP', atSec: 0.15 }];
  let cursor = 0;
  for (let i = 0; i < segmentDurationsSec.length - 1; i += 1) {
    cursor += segmentDurationsSec[i] ?? 0;
    cues.push({
      preset: i % 2 === 0 ? 'WHOOSH' : 'GLITCH',
      atSec: Math.max(0, Math.round((cursor - 0.12) * 100) / 100),
    });
  }
  return cues;
}

/**
 * Synthesizes a standalone 48kHz stereo WAV file for a given SFX preset using FFmpeg.
 */
export function synthesizeSfxWav(preset: SfxPresetId, outputPath: string): void {
  const spec = SFX_PRESETS[preset];
  const res = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', spec.lavfiExpr,
      '-ar', '48000',
      '-ac', '2',
      outputPath,
    ],
    { stdio: 'pipe' },
  );
  if (res.status !== 0) {
    throw new Error(`FFmpeg SFX synthesis failed for ${preset}: ${res.stderr.toString().slice(-300)}`);
  }
}
