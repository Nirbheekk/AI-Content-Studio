import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { detectMimeTypeFromMagicBytes } from '@ai-content-os/shared';
import {
  buildWordTimestampsFromText,
  generateValidSolidPng,
  generateValidWavAudio,
  UnifiedAIProviderRegistry,
} from '../index.js';

describe('@ai-content-os/ai-providers', () => {
  it('generates valid PNG and WAV binary buffers verified by magic bytes', () => {
    const png = generateValidSolidPng({ width: 64, height: 64, r: 10, g: 20, b: 30 });
    const wav = generateValidWavAudio(1, 8000);

    expect(detectMimeTypeFromMagicBytes(png)).toBe('image/png');
    expect(detectMimeTypeFromMagicBytes(wav)).toBe('audio/wav');
  });

  it('executes structured JSON generation with explicit fallback telemetry when live keys are absent', async () => {
    const registry = new UnifiedAIProviderRegistry({});
    const status = registry.getConfiguredProviderStatus();
    expect(status.hasLiveLlmCredentials).toBe(false);
    expect(status.llmProvider).toBe('simulated-dev-fallback');

    const Schema = z.object({
      hook: z.string(),
      score: z.number(),
    });

    const result = await registry.generateStructured({
      agentName: 'CREATIVE_DIRECTOR',
      systemPrompt: 'Generate a short-form hook.',
      userPrompt: 'Podcast about AI agents',
      schema: Schema,
      fallbackFactory: () => ({
        hook: '[SIMULATED FALLBACK] Why AI Agents Change Video Production',
        score: 0.95,
      }),
    });

    expect(result.telemetry.isSimulated).toBe(true);
    expect(result.telemetry.provider).toBe('simulated-dev-fallback');
    expect(result.data.score).toBe(0.95);
  });

  it('transcribes audio with word-level timestamps and synthesizes TTS audio', async () => {
    const registry = new UnifiedAIProviderRegistry({});
    const stt = await registry.transcribeAudio({
      assetId: 'asset-123456',
      originalName: 'founder-clip.mp4',
      mimeType: 'video/mp4',
      durationSec: 12,
    });

    expect(stt.telemetry.isSimulated).toBe(true);
    expect(stt.data.segments).toHaveLength(2);
    expect(stt.data.segments[0]?.words.length).toBeGreaterThan(3);

    const tts = await registry.synthesizeSpeech({
      text: 'Welcome to AI Content Operating System phase two verification.',
    });
    expect(tts.telemetry.isSimulated).toBe(true);
    expect(detectMimeTypeFromMagicBytes(tts.data.audioBytes)).toBe('audio/wav');

    const words = buildWordTimestampsFromText('Describe it Create it Publish it', 0, 3);
    expect(words).toHaveLength(6);
    expect(words[0]?.startSec).toBe(0);
    expect(words[5]?.endSec).toBe(3);
  });
});
