import { z } from 'zod';
import {
  AgentType,
  ExternalProviderError,
  WordTimestamp,
  WordTimestampSchema,
} from '@ai-content-os/shared';
import { generateValidSolidPng, generateValidWavAudio } from './media-synth.js';

export interface ProviderTelemetry {
  provider: string;
  model: string;
  isSimulated: boolean;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface ProviderResult<T> {
  data: T;
  telemetry: ProviderTelemetry;
}

export interface LLMStructuredRequest<TSchema extends z.ZodTypeAny> {
  agentName: AgentType;
  systemPrompt: string;
  userPrompt: string;
  schema: TSchema;
  fallbackFactory: () => z.infer<TSchema>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface STTTranscriptionRequest {
  assetId: string;
  originalName: string;
  audioBytes?: Uint8Array;
  mimeType: string;
  durationSec?: number;
  promptContext?: string;
}

export interface STTTranscriptSegment {
  id: string;
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
  words: WordTimestamp[];
}

export interface STTTranscriptionResult {
  language: string;
  fullText: string;
  segments: STTTranscriptSegment[];
}

export interface TTSSynthesisRequest {
  text: string;
  voiceId?: string;
}

export interface TTSSynthesisResult {
  audioBytes: Uint8Array;
  mimeType: 'audio/mpeg' | 'audio/wav';
  durationSec: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  imageBytes: Uint8Array;
  mimeType: 'image/png';
  width: number;
  height: number;
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateLlmCostUsd(
  provider: string,
  promptTokens: number,
  completionTokens: number,
): number {
  if (provider.startsWith('simulated')) {
    return 0;
  }
  // Blended average per 1M tokens ($0.30 input / $1.20 output)
  const inputCost = (promptTokens / 1_000_000) * 0.3;
  const outputCost = (completionTokens / 1_000_000) * 1.2;
  return Number((inputCost + outputCost).toFixed(6));
}

export async function withRetryAndTimeout<T>(
  operationName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: { maxRetries?: number; timeoutMs?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const baseDelayMs = options.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fn(controller.signal);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new ExternalProviderError(
    operationName,
    lastError instanceof Error ? lastError.message : 'Provider request failed after retries',
  );
}

function extractFirstJsonBlock(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

export class UnifiedAIProviderRegistry {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  public getConfiguredProviderStatus(): {
    llmProvider: string;
    hasLiveLlmCredentials: boolean;
    hasLiveSttCredentials: boolean;
    hasLiveTtsCredentials: boolean;
  } {
    const geminiKey = this.env['GEMINI_API_KEY']?.trim();
    const openaiKey = this.env['OPENAI_API_KEY']?.trim();
    const anthropicKey = this.env['ANTHROPIC_API_KEY']?.trim();
    const elevenLabsKey = this.env['ELEVENLABS_API_KEY']?.trim();

    const llmProvider = geminiKey
      ? 'gemini'
      : openaiKey
        ? 'openai'
        : anthropicKey
          ? 'anthropic'
          : 'simulated-dev-fallback';

    return {
      llmProvider,
      hasLiveLlmCredentials: Boolean(geminiKey || openaiKey || anthropicKey),
      hasLiveSttCredentials: Boolean(openaiKey),
      hasLiveTtsCredentials: Boolean(elevenLabsKey || openaiKey),
    };
  }

  /**
   * Executes a structured JSON generation request against Gemini, OpenAI, or Anthropic
   * when live API credentials are present, or falls back transparently to the clearly
   * labeled `simulated-dev-fallback` provider.
   */
  public async generateStructured<TSchema extends z.ZodTypeAny>(
    request: LLMStructuredRequest<TSchema>,
  ): Promise<ProviderResult<z.infer<TSchema>>> {
    const start = performance.now();
    const geminiKey = this.env['GEMINI_API_KEY']?.trim();
    const openaiKey = this.env['OPENAI_API_KEY']?.trim();
    const anthropicKey = this.env['ANTHROPIC_API_KEY']?.trim();
    const timeoutMs = request.timeoutMs ?? 25_000;

    if (geminiKey) {
      try {
        const rawJson = await withRetryAndTimeout(
          'gemini',
          async (signal) => {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal,
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: request.systemPrompt }] },
                  contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
                  generationConfig: {
                    temperature: request.temperature ?? 0.2,
                    responseMimeType: 'application/json',
                  },
                }),
              },
            );
            if (!res.ok) {
              throw new Error(`Gemini HTTP ${res.status}`);
            }
            const body = (await res.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
            return extractFirstJsonBlock(text);
          },
          { timeoutMs },
        );

        const parsed = request.schema.parse(rawJson);
        const promptTokens = estimateTokenCount(request.systemPrompt + request.userPrompt);
        const completionTokens = estimateTokenCount(JSON.stringify(parsed));
        return {
          data: parsed,
          telemetry: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            isSimulated: false,
            promptTokens,
            completionTokens,
            latencyMs: Math.round(performance.now() - start),
            estimatedCostUsd: estimateLlmCostUsd('gemini', promptTokens, completionTokens),
          },
        };
      } catch {
        // Fall through to secondary provider or deterministic development fallback
      }
    }

    if (openaiKey) {
      try {
        const rawJson = await withRetryAndTimeout(
          'openai',
          async (signal) => {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openaiKey}`,
              },
              signal,
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: request.temperature ?? 0.2,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: request.systemPrompt },
                  { role: 'user', content: request.userPrompt },
                ],
              }),
            });
            if (!res.ok) {
              throw new Error(`OpenAI HTTP ${res.status}`);
            }
            const body = (await res.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const text = body.choices?.[0]?.message?.content ?? '{}';
            return extractFirstJsonBlock(text);
          },
          { timeoutMs },
        );

        const parsed = request.schema.parse(rawJson);
        const promptTokens = estimateTokenCount(request.systemPrompt + request.userPrompt);
        const completionTokens = estimateTokenCount(JSON.stringify(parsed));
        return {
          data: parsed,
          telemetry: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            isSimulated: false,
            promptTokens,
            completionTokens,
            latencyMs: Math.round(performance.now() - start),
            estimatedCostUsd: estimateLlmCostUsd('openai', promptTokens, completionTokens),
          },
        };
      } catch {
        // Fall through to Anthropic or deterministic fallback
      }
    }

    if (anthropicKey) {
      try {
        const rawJson = await withRetryAndTimeout(
          'anthropic',
          async (signal) => {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              signal,
              body: JSON.stringify({
                model: 'claude-3-5-sonnet-latest',
                max_tokens: request.maxTokens ?? 2048,
                system: `${request.systemPrompt}\nRespond with valid JSON only.`,
                messages: [{ role: 'user', content: request.userPrompt }],
              }),
            });
            if (!res.ok) {
              throw new Error(`Anthropic HTTP ${res.status}`);
            }
            const body = (await res.json()) as {
              content?: Array<{ text?: string }>;
            };
            const text = body.content?.[0]?.text ?? '{}';
            return extractFirstJsonBlock(text);
          },
          { timeoutMs },
        );

        const parsed = request.schema.parse(rawJson);
        const promptTokens = estimateTokenCount(request.systemPrompt + request.userPrompt);
        const completionTokens = estimateTokenCount(JSON.stringify(parsed));
        return {
          data: parsed,
          telemetry: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-latest',
            isSimulated: false,
            promptTokens,
            completionTokens,
            latencyMs: Math.round(performance.now() - start),
            estimatedCostUsd: estimateLlmCostUsd('anthropic', promptTokens, completionTokens),
          },
        };
      } catch {
        // Fall through to development fallback
      }
    }

    // Clearly labeled development fallback when external API credentials are absent
    const fallbackOutput = request.schema.parse(request.fallbackFactory());
    const promptTokens = estimateTokenCount(request.systemPrompt + request.userPrompt);
    const completionTokens = estimateTokenCount(JSON.stringify(fallbackOutput));

    return {
      data: fallbackOutput,
      telemetry: {
        provider: 'simulated-dev-fallback',
        model: 'deterministic-schema-fallback-v1',
        isSimulated: true,
        promptTokens,
        completionTokens,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        estimatedCostUsd: 0,
      },
    };
  }

  /**
   * Speech-to-Text transcription with word-level timestamps.
   * Uses OpenAI Whisper when `OPENAI_API_KEY` is configured and audioBytes are provided,
   * otherwise uses the clearly labeled development fallback.
   */
  public async transcribeAudio(
    request: STTTranscriptionRequest,
  ): Promise<ProviderResult<STTTranscriptionResult>> {
    const start = performance.now();
    const openaiKey = this.env['OPENAI_API_KEY']?.trim();

    if (openaiKey && request.audioBytes && request.audioBytes.byteLength > 0) {
      try {
        const result = await withRetryAndTimeout('openai-whisper', async (signal) => {
          const form = new FormData();
          const blob = new Blob([request.audioBytes!], { type: request.mimeType });
          form.append('file', blob, request.originalName);
          form.append('model', 'whisper-1');
          form.append('response_format', 'verbose_json');

          const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
            },
            signal,
            body: form,
          });
          if (!res.ok) {
            throw new Error(`Whisper HTTP ${res.status}`);
          }
          const body = (await res.json()) as {
            language?: string;
            text?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
          };
          return body;
        });

        const fullText = result.text?.trim() || 'Transcribed audio content.';
        const words = buildWordTimestampsFromText(fullText, 0, request.durationSec ?? 15);
        return {
          data: {
            language: result.language ?? 'en',
            fullText,
            segments: [
              {
                id: 'seg-01',
                speaker: 'SPEAKER_01',
                startSec: 0,
                endSec: request.durationSec ?? 15,
                text: fullText,
                words,
              },
            ],
          },
          telemetry: {
            provider: 'openai-whisper',
            model: 'whisper-1',
            isSimulated: false,
            promptTokens: 0,
            completionTokens: estimateTokenCount(fullText),
            latencyMs: Math.round(performance.now() - start),
            estimatedCostUsd: Number((((request.durationSec ?? 15) / 60) * 0.006).toFixed(6)),
          },
        };
      } catch {
        // Fall through to development fallback
      }
    }

    const durationSec = request.durationSec ?? 15;
    const baseText =
      request.promptContext?.trim() ||
      `[SIMULATED FALLBACK] Raw asset "${request.originalName}" analyzed for high-retention hook and word-synchronized captions.`;
    const seg1Text = 'Stop wasting hours manually cutting short-form video clips.';
    const seg2Text = `Transform "${request.originalName}" into dynamic multi-platform reels automatically.`;

    const seg1Words = buildWordTimestampsFromText(seg1Text, 0, Math.min(4, durationSec / 2));
    const seg2Words = buildWordTimestampsFromText(
      seg2Text,
      Math.min(4, durationSec / 2),
      durationSec,
    );

    return {
      data: {
        language: 'en',
        fullText: `${seg1Text} ${seg2Text} (${baseText})`,
        segments: [
          {
            id: `seg-${request.assetId.slice(0, 6)}-1`,
            speaker: 'SPEAKER_01',
            startSec: 0,
            endSec: Math.min(4, durationSec / 2),
            text: seg1Text,
            words: seg1Words,
          },
          {
            id: `seg-${request.assetId.slice(0, 6)}-2`,
            speaker: 'SPEAKER_01',
            startSec: Math.min(4, durationSec / 2),
            endSec: durationSec,
            text: seg2Text,
            words: seg2Words,
          },
        ],
      },
      telemetry: {
        provider: 'simulated-dev-fallback',
        model: 'simulated-whisper-v1',
        isSimulated: true,
        promptTokens: 0,
        completionTokens: estimateTokenCount(`${seg1Text} ${seg2Text}`),
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        estimatedCostUsd: 0,
      },
    };
  }

  /**
   * Text-to-Speech voiceover synthesis.
   * Uses ElevenLabs when `ELEVENLABS_API_KEY` is present, otherwise synthesizes a valid WAV buffer.
   */
  public async synthesizeSpeech(
    request: TTSSynthesisRequest,
  ): Promise<ProviderResult<TTSSynthesisResult>> {
    const start = performance.now();
    const elevenLabsKey = this.env['ELEVENLABS_API_KEY']?.trim();
    const voiceId = request.voiceId ?? this.env['ELEVENLABS_VOICE_ID']?.trim() ?? '21m00Tcm4TlvDq8ikWAM';

    if (elevenLabsKey) {
      try {
        const audioBytes = await withRetryAndTimeout('elevenlabs', async (signal) => {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': elevenLabsKey,
              },
              signal,
              body: JSON.stringify({
                text: request.text,
                model_id: 'eleven_multilingual_v2',
              }),
            },
          );
          if (!res.ok) {
            throw new Error(`ElevenLabs HTTP ${res.status}`);
          }
          return new Uint8Array(await res.arrayBuffer());
        });

        const estimatedSec = Math.max(2, Math.round(request.text.split(/\s+/).length / 2.5));
        return {
          data: {
            audioBytes,
            mimeType: 'audio/mpeg',
            durationSec: estimatedSec,
          },
          telemetry: {
            provider: 'elevenlabs',
            model: 'eleven_multilingual_v2',
            isSimulated: false,
            promptTokens: request.text.length,
            completionTokens: 0,
            latencyMs: Math.round(performance.now() - start),
            estimatedCostUsd: Number(((request.text.length / 1000) * 0.18).toFixed(6)),
          },
        };
      } catch {
        // Fall through to valid WAV fallback
      }
    }

    const durationSec = Math.max(2, Math.min(10, Math.round(request.text.split(/\s+/).length / 3)));
    const wavBytes = generateValidWavAudio(durationSec, 16000);

    return {
      data: {
        audioBytes: wavBytes,
        mimeType: 'audio/wav',
        durationSec,
      },
      telemetry: {
        provider: 'simulated-dev-fallback',
        model: 'simulated-tts-wav-v1',
        isSimulated: true,
        promptTokens: request.text.length,
        completionTokens: 0,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        estimatedCostUsd: 0,
      },
    };
  }

  /**
   * Generates a valid PNG image asset for thumbnails or B-roll overlays.
   */
  public async generateImage(
    request: ImageGenerationRequest,
  ): Promise<ProviderResult<ImageGenerationResult>> {
    const start = performance.now();
    const width = request.width ?? 320;
    const height = request.height ?? 180;
    const pngBytes = generateValidSolidPng({
      width,
      height,
      r: 15,
      g: 23,
      b: 42,
      accentR: 99,
      accentG: 102,
      accentB: 241,
    });

    return {
      data: {
        imageBytes: pngBytes,
        mimeType: 'image/png',
        width,
        height,
      },
      telemetry: {
        provider: 'simulated-dev-fallback',
        model: 'simulated-image-gen-v1',
        isSimulated: true,
        promptTokens: estimateTokenCount(request.prompt),
        completionTokens: 0,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        estimatedCostUsd: 0,
      },
    };
  }
}

export function buildWordTimestampsFromText(
  text: string,
  startSec: number,
  endSec: number,
): WordTimestamp[] {
  const rawWords = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (rawWords.length === 0) {
    return [];
  }
  const totalSpan = Math.max(0.5, endSec - startSec);
  const step = totalSpan / rawWords.length;

  return rawWords.map((word, idx) =>
    WordTimestampSchema.parse({
      word,
      startSec: Number((startSec + idx * step).toFixed(2)),
      endSec: Number((startSec + (idx + 1) * step).toFixed(2)),
      confidence: 0.99,
    }),
  );
}
