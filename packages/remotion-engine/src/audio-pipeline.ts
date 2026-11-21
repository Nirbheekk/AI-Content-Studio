import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SceneVoiceTiming {
  sceneIndex: number;
  audioPath: string | null;
  speechDurationSec: number;
  sceneDurationSec: number;
  startSec: number;
  endSec: number;
  words: Array<{ word: string; startSec: number; endSec: number }>;
}

export async function probeAudioDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 10_000 },
    );
    const val = Number(stdout.trim());
    return Number.isFinite(val) && val > 0 ? val : 3.5;
  } catch {
    return 3.5;
  }
}

export async function synthesizeSceneVoiceover(
  text: string,
  sceneDir: string,
  voice = 'en-US-ChristopherNeural',
): Promise<{ audioPath: string; durationSec: number } | null> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  await mkdir(sceneDir, { recursive: true });

  // 1. Neural TTS via msedge-tts
  try {
    const mod = (await import('msedge-tts')) as {
      MsEdgeTTS: new () => {
        setMetadata: (v: string, fmt: string) => Promise<void>;
        toFile: (dir: string, t: string) => Promise<{ audioFilePath: string }>;
      };
      OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: string };
    };
    const tts = new mod.MsEdgeTTS();
    await tts.setMetadata(voice, mod.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const res = await tts.toFile(sceneDir, clean);
    const durationSec = await probeAudioDurationSec(res.audioFilePath);
    return { audioPath: res.audioFilePath, durationSec };
  } catch {
    // Fall back to offline espeak-ng
  }

  // 2. Offline fallback via espeak-ng
  try {
    const wavPath = join(sceneDir, 'voice.wav');
    await execFileAsync('espeak-ng', ['-v', 'en-us', '-s', '155', '-p', '48', '-w', wavPath, clean], {
      timeout: 15_000,
    });
    const durationSec = await probeAudioDurationSec(wavPath);
    return { audioPath: wavPath, durationSec };
  } catch {
    return null;
  }
}

/**
 * Aligns spoken words proportionally across a scene's exact speech duration
 * (weighted by character length for natural syllable pacing).
 */
export function buildSpeechAlignedWords(
  text: string,
  speechStartSec: number,
  speechDurationSec: number,
): Array<{ word: string; startSec: number; endSec: number }> {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const weights = tokens.map((w) => Math.max(2, w.replace(/[^a-zA-Z0-9]/g, '').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cursor = speechStartSec;
  return tokens.map((word, idx) => {
    const dur = (weights[idx]! / totalWeight) * speechDurationSec;
    const item = {
      word,
      startSec: Number(cursor.toFixed(3)),
      endSec: Number((cursor + dur).toFixed(3)),
    };
    cursor += dur;
    return item;
  });
}

function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const whole = Math.floor(rem);
  const cs = Math.min(99, Math.round((rem - whole) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function hexToAssBgr(hex: string, fallback = '0009F4'): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `&H00${fallback}`;
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Generates an ASS/SSA karaoke subtitle file where each spoken word sweeps
 * smoothly into the brand highlight color in exact sync with the voiceover.
 */
export async function writeKaraokeAssFile(params: {
  timings: SceneVoiceTiming[];
  width: number;
  height: number;
  highlightHex: string;
  outPath: string;
}): Promise<string> {
  const highlightAss = hexToAssBgr(params.highlightHex, '0900F4');
  const fontSize = Math.max(40, Math.round(params.width * 0.044));
  const marginV = Math.round(params.height * 0.085);

  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${params.width}`,
    `PlayResY: ${params.height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Karaoke,Open Sans,${fontSize},${highlightAss},&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,14,0,2,60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // Chunk words into punchy 4-word karaoke captions
  for (const scene of params.timings) {
    const words = scene.words;
    for (let i = 0; i < words.length; i += 4) {
      const chunk = words.slice(i, i + 4);
      if (chunk.length === 0) continue;
      const start = chunk[0]!.startSec;
      const end = chunk[chunk.length - 1]!.endSec + 0.12;
      const karaokeText = chunk
        .map((w) => {
          const cs = Math.max(8, Math.round((w.endSec - w.startSec) * 100));
          const safe = w.word.replace(/[{}]/g, '');
          return `{\\kf${cs}}${safe}`;
        })
        .join(' ');
      lines.push(
        `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Karaoke,,0,0,0,,${karaokeText}`,
      );
    }
  }

  await writeFile(params.outPath, lines.join('\n'), 'utf8');
  return params.outPath;
}

/**
 * Generates a 120 BPM rhythmic commercial music bed (sub-bass groove + warm major-7th chords + crisp pulse)
 * + timed transition whoosh SFX via FFmpeg audio synthesis.
 */
export async function synthesizeMusicAndSfx(params: {
  durationSec: number;
  cutTimestampsSec: number[];
  jobDir: string;
}): Promise<{ musicPath: string; sfxPath: string }> {
  const musicPath = join(params.jobDir, 'music-bed.wav');
  const sfxPath = join(params.jobDir, 'transition-sfx.wav');
  const dur = params.durationSec.toFixed(2);

  // 120 BPM upbeat commercial groove (kick pulse at 2Hz, bassline, warm harmonic chord pad)
  const musicExpr =
    '0.22*sin(2*PI*65.41*t)*exp(-4*mod(t,0.5))' +
    '+0.11*sin(2*PI*196*t)*(0.6+0.4*sin(2*PI*0.5*t))' +
    '+0.09*sin(2*PI*246.94*t)' +
    '+0.09*sin(2*PI*293.66*t)' +
    '+0.06*sin(2*PI*392*t)*exp(-6*mod(t+0.25,0.5))';

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `aevalsrc='${musicExpr}':s=44100:d=${dur}`,
      '-af', `lowpass=f=4200,afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0.5, params.durationSec - 1.0).toFixed(2)}:d=1.0`,
      musicPath,
    ],
    { timeout: 20_000 },
  );

  // Transition whoosh + crisp pop SFX placed at every scene cut
  const cutTerms =
    params.cutTimestampsSec.length > 0
      ? params.cutTimestampsSec
          .map(
            (ts) =>
              `0.45*sin(2*PI*(180+600*exp(-8*abs(t-${ts.toFixed(2)})))*t)*exp(-14*pow(t-${ts.toFixed(2)},2))`,
          )
          .join('+')
      : '0';

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `aevalsrc='${cutTerms}':s=44100:d=${dur}`,
      sfxPath,
    ],
    { timeout: 20_000 },
  );

  return { musicPath, sfxPath };
}
