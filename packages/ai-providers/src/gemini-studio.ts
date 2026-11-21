import { GoogleGenAI } from '@google/genai';

export interface GeminiStudioConfig {
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
  ttsModel?: string;
  ttsVoice?: string;
  videoModel?: string;
}

export interface GeminiBinaryResult {
  bytes: Uint8Array;
  mimeType: string;
  model: string;
  latencyMs: number;
}

interface InteractionContentPart {
  type?: string;
  data?: string;
  mime_type?: string;
  text?: string;
}

interface InteractionStepLike {
  type?: string;
  content?: InteractionContentPart[];
}

interface InteractionLike {
  output_text?: string | null;
  output_image?: { data?: string; mime_type?: string } | null;
  output_audio?: { data?: string; mime_type?: string } | null;
  steps?: InteractionStepLike[];
}

/**
 * Unified Google AI Studio client powered by the official `@google/genai` SDK.
 * Covers all 4 SOTA creative modalities with a single GEMINI_API_KEY:
 * - Text & Structured JSON (`gemini-4-hydrogen`)
 * - Commercial Image Generation (`gemini-nano-banana-2.1`)
 * - Expressive Commercial Voiceover TTS (`gemini-3.8-flash-tts`)
 * - Generative Video B-Roll (`gemini-omni-1.2-flash`)
 */
export class GeminiStudioClient {
  private readonly apiKey: string | undefined;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly ttsModel: string;
  private readonly ttsVoice: string;
  private readonly videoModel: string;

  constructor(config: GeminiStudioConfig = {}) {
    this.apiKey = config.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
    this.textModel = config.textModel ?? process.env['GEMINI_TEXT_MODEL'] ?? 'gemini-4-hydrogen';
    this.imageModel =
      config.imageModel ?? process.env['GEMINI_IMAGE_MODEL'] ?? 'gemini-nano-banana-2.1';
    this.ttsModel = config.ttsModel ?? process.env['GEMINI_TTS_MODEL'] ?? 'gemini-3.8-flash-tts';
    this.ttsVoice = config.ttsVoice ?? process.env['GEMINI_TTS_VOICE'] ?? 'achernar';
    this.videoModel =
      config.videoModel ?? process.env['GEMINI_VIDEO_MODEL'] ?? 'gemini-omni-1.2-flash';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  private getClient(): GoogleGenAI {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey: this.apiKey });
  }

  public async generateText(prompt: string): Promise<{ text: string; model: string; latencyMs: number }> {
    const start = performance.now();
    const ai = this.getClient();
    const interaction = (await ai.interactions.create({
      model: this.textModel,
      input: prompt,
      store: false,
    })) as unknown as InteractionLike;
    return {
      text: interaction.output_text ?? '',
      model: this.textModel,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  public async generateSceneImage(prompt: string): Promise<GeminiBinaryResult | null> {
    if (!this.isConfigured()) return null;
    const start = performance.now();
    const ai = this.getClient();
    const interaction = (await ai.interactions.create({
      model: this.imageModel,
      input: prompt,
      response_modalities: ['image'],
      store: false,
    })) as unknown as InteractionLike;

    const img = interaction.output_image ?? this.findPart(interaction, 'image');
    if (!img?.data) return null;
    return {
      bytes: new Uint8Array(Buffer.from(img.data, 'base64')),
      mimeType: img.mime_type ?? 'image/png',
      model: this.imageModel,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  public async synthesizeVoiceover(
    narrationText: string,
    direction = 'Speak with warm, crisp, energetic commercial studio charisma:',
  ): Promise<GeminiBinaryResult | null> {
    if (!this.isConfigured()) return null;
    const start = performance.now();
    const ai = this.getClient();
    const interaction = (await ai.interactions.create({
      model: this.ttsModel,
      input: `${direction} ${narrationText}`,
      response_modalities: ['audio'],
      generation_config: {
        speech_config: [{ voice: this.ttsVoice, language: 'en-US' }],
      },
      store: false,
    })) as unknown as InteractionLike;

    const audio = interaction.output_audio ?? this.findPart(interaction, 'audio');
    if (!audio?.data) return null;
    return {
      bytes: new Uint8Array(Buffer.from(audio.data, 'base64')),
      mimeType: audio.mime_type ?? 'audio/wav',
      model: this.ttsModel,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  public async generateSceneVideo(prompt: string): Promise<GeminiBinaryResult | null> {
    if (!this.isConfigured()) return null;
    const start = performance.now();
    const ai = this.getClient();
    const interaction = (await ai.interactions.create({
      model: this.videoModel,
      input: prompt,
      response_modalities: ['video'],
      store: false,
    })) as unknown as InteractionLike;

    const video = this.findPart(interaction, 'video');
    if (!video?.data) return null;
    return {
      bytes: new Uint8Array(Buffer.from(video.data, 'base64')),
      mimeType: video.mime_type ?? 'video/mp4',
      model: this.videoModel,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  private findPart(
    interaction: InteractionLike,
    targetType: 'image' | 'audio' | 'video',
  ): InteractionContentPart | null {
    for (const step of interaction.steps ?? []) {
      if (step.type !== 'model_output') continue;
      for (const part of step.content ?? []) {
        if (part.type === targetType && part.data) {
          return part;
        }
      }
    }
    return null;
  }
}
