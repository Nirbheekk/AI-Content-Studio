import { z } from 'zod';

// -----------------------------------------------------------------------------
// Stage 5 — Generative Media & Creative Asset Intelligence Contracts
// -----------------------------------------------------------------------------

export const GenerativeTaskTypeSchema = z.enum([
  'TEXT_TO_IMAGE',
  'IMAGE_EDIT',
  'TEXT_TO_VIDEO',
  'IMAGE_TO_VIDEO',
  'VIDEO_EXTENSION',
  'TEXT_TO_SPEECH',
  'VOICEOVER',
  'VOICE_CLONE',
  'AUDIO_CLEANUP',
  'MUSIC_GENERATION',
  'SFX_GENERATION',
  'BACKGROUND_REMOVAL',
]);
export type GenerativeTaskType = z.infer<typeof GenerativeTaskTypeSchema>;

export const ProviderAvailabilityStatusSchema = z.enum([
  'AVAILABLE_LIVE',
  'LOCAL_DETERMINISTIC',
  'PENDING_CREDENTIALS',
  'UNAVAILABLE',
]);
export type ProviderAvailabilityStatus = z.infer<typeof ProviderAvailabilityStatusSchema>;

export interface GenerativeProviderCapability {
  providerId: string;
  displayName: string;
  supportedTasks: readonly GenerativeTaskType[];
  inputFormats: readonly string[];
  outputFormats: readonly string[];
  maxDurationSec: number | null;
  maxResolution: string;
  supportedAspectRatios: readonly string[];
  models: readonly string[];
  supportedRegions: readonly string[];
  authEnvVar: string | null;
  costModel: string;
  unitPriceUsd: number | null; // null => UNKNOWN (never fabricated)
  costUnit: string;
  rateLimitNote: string;
  limitations: readonly string[];
  commercialUseNote: string;
  watermarkOrProvenance: string;
  requiresVoiceConsent: boolean;
}

export const PROVIDER_CAPABILITY_REGISTRY: readonly GenerativeProviderCapability[] = [
  {
    providerId: 'google-gemini-media',
    displayName: 'Google Gemini / Imagen / Veo',
    supportedTasks: ['TEXT_TO_IMAGE', 'IMAGE_EDIT', 'TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO'],
    inputFormats: ['text/plain', 'image/png', 'image/jpeg', 'image/webp'],
    outputFormats: ['image/png', 'video/mp4'],
    maxDurationSec: 8,
    maxResolution: '1920x1080',
    supportedAspectRatios: ['PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE_1_1', 'PORTRAIT_4_5'],
    models: ['imagen-3.0-generate-002', 'veo-2.0-generate-001', 'gemini-2.5-flash'],
    supportedRegions: ['US', 'EU', 'APAC'],
    authEnvVar: 'GEMINI_API_KEY',
    costModel: 'Per-image / per-second metered API',
    unitPriceUsd: 0.04,
    costUnit: 'per image (video priced per sec; confirm live console pricing)',
    rateLimitNote: 'Subject to Google AI Studio tier RPM/TPM quotas',
    limitations: [
      'Veo video clips capped at 8s per call; longer scenes require storyboard stitching.',
      'Requires valid GEMINI_API_KEY with billing enabled for live generation.',
    ],
    commercialUseNote: 'Commercial use permitted under paid Google AI API terms; verify likeness/trademark rights.',
    watermarkOrProvenance: 'SynthID digital watermark + stored prompt/model provenance metadata.',
    requiresVoiceConsent: false,
  },
  {
    providerId: 'openai-media',
    displayName: 'OpenAI Images & TTS',
    supportedTasks: ['TEXT_TO_IMAGE', 'IMAGE_EDIT', 'TEXT_TO_SPEECH', 'VOICEOVER'],
    inputFormats: ['text/plain', 'image/png'],
    outputFormats: ['image/png', 'audio/mpeg', 'audio/wav'],
    maxDurationSec: 180,
    maxResolution: '1536x1024',
    supportedAspectRatios: ['SQUARE_1_1', 'PORTRAIT_9_16', 'LANDSCAPE_16_9'],
    models: ['gpt-image-1', 'gpt-4o-mini-tts'],
    supportedRegions: ['GLOBAL_SUPPORTED'],
    authEnvVar: 'OPENAI_API_KEY',
    costModel: 'Per-image or per-1M characters',
    unitPriceUsd: 0.04,
    costUnit: 'per standard image',
    rateLimitNote: 'Tier-based requests per minute',
    limitations: [
      'No native video generation in this adapter.',
      'Requires OPENAI_API_KEY for live generation.',
    ],
    commercialUseNote: 'Commercial rights assigned to customer per OpenAI API terms.',
    watermarkOrProvenance: 'C2PA / prompt provenance persisted in Asset aiMetadataJson.',
    requiresVoiceConsent: false,
  },
  {
    providerId: 'elevenlabs-voice',
    displayName: 'ElevenLabs Voice Studio',
    supportedTasks: ['TEXT_TO_SPEECH', 'VOICEOVER', 'VOICE_CLONE', 'SFX_GENERATION'],
    inputFormats: ['text/plain', 'audio/wav', 'audio/mpeg'],
    outputFormats: ['audio/mpeg', 'audio/wav'],
    maxDurationSec: 300,
    maxResolution: 'audio-only',
    supportedAspectRatios: ['AUDIO_ONLY'],
    models: ['eleven_multilingual_v2', 'eleven_flash_v2_5'],
    supportedRegions: ['GLOBAL'],
    authEnvVar: 'ELEVENLABS_API_KEY',
    costModel: 'Per-1k characters',
    unitPriceUsd: 0.18,
    costUnit: 'per 1k characters (approx.)',
    rateLimitNote: 'Concurrent stream limit depends on plan tier',
    limitations: [
      'Voice cloning is strictly blocked without an ACTIVE VoiceConsentRecord.',
      'Requires ELEVENLABS_API_KEY for live synthesis.',
    ],
    commercialUseNote: 'Commercial rights require paid ElevenLabs tier; voice owner consent mandatory for cloning.',
    watermarkOrProvenance: 'Provider synthesis ID + consent record ID logged in AuditLog.',
    requiresVoiceConsent: true,
  },
  {
    providerId: 'runway-gen',
    displayName: 'Runway Gen-3 / Gen-4 Video',
    supportedTasks: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_EXTENSION'],
    inputFormats: ['text/plain', 'image/png', 'video/mp4'],
    outputFormats: ['video/mp4'],
    maxDurationSec: 10,
    maxResolution: '1280x768',
    supportedAspectRatios: ['LANDSCAPE_16_9', 'PORTRAIT_9_16'],
    models: ['gen3a_turbo', 'gen4_turbo'],
    supportedRegions: ['GLOBAL'],
    authEnvVar: 'RUNWAY_API_SECRET',
    costModel: 'Credits per second (pricing varies by account plan)',
    unitPriceUsd: null, // Explicitly UNKNOWN until configured
    costUnit: 'per second',
    rateLimitNote: 'Strict concurrent job queue limits',
    limitations: [
      'Pricing marked UNKNOWN until workspace plan rates are configured.',
      'Requires RUNWAY_API_SECRET for live video generation.',
    ],
    commercialUseNote: 'Commercial use permitted on paid Runway plans; verify third-party IP in reference frames.',
    watermarkOrProvenance: 'C2PA provenance + generation job ID persisted.',
    requiresVoiceConsent: false,
  },
  {
    providerId: 'local-ffmpeg-audio-studio',
    displayName: 'Local Deterministic Media & Audio Studio (FFmpeg)',
    supportedTasks: [
      'TEXT_TO_IMAGE',
      'VOICEOVER',
      'TEXT_TO_SPEECH',
      'AUDIO_CLEANUP',
      'BACKGROUND_REMOVAL',
      'MUSIC_GENERATION',
    ],
    inputFormats: ['text/plain', 'audio/wav', 'video/mp4', 'image/png'],
    outputFormats: ['image/png', 'audio/wav', 'video/mp4'],
    maxDurationSec: 120,
    maxResolution: '1920x1080',
    supportedAspectRatios: ['PORTRAIT_9_16', 'PORTRAIT_4_5', 'SQUARE_1_1', 'LANDSCAPE_16_9'],
    models: ['ffmpeg-loudnorm-v1', 'deterministic-brand-card-v1', 'local-synth-wav-v1'],
    supportedRegions: ['LOCAL_HOST'],
    authEnvVar: null,
    costModel: 'Local compute ($0.00 external API spend)',
    unitPriceUsd: 0,
    costUnit: 'per local job',
    rateLimitNote: 'Bounded by local CPU/FFmpeg worker concurrency',
    limitations: [
      'Produces deterministic brand cards, clean WAV narration tones/audio normalization, and local FFmpeg filters.',
      'Outputs are explicitly tagged SIMULATED when acting as fallback for generative photo/video.',
    ],
    commercialUseNote: 'Generated locally with zero third-party stock licensing encumbrance; verify any input media rights.',
    watermarkOrProvenance: 'Explicitly labeled local-deterministic / [SIMULATED] in provenance metadata.',
    requiresVoiceConsent: false,
  },
];

export const CreateGenerativeJobRequestSchema = z.object({
  projectId: z.string().uuid(),
  taskType: GenerativeTaskTypeSchema,
  providerId: z.string().min(1).default('local-ffmpeg-audio-studio'),
  model: z.string().min(1).optional(),
  prompt: z.string().min(3).max(2000),
  negativePrompt: z.string().max(1000).optional(),
  aspectRatio: z
    .enum(['PORTRAIT_9_16', 'PORTRAIT_4_5', 'SQUARE_1_1', 'LANDSCAPE_16_9', 'AUDIO_ONLY'])
    .default('PORTRAIT_9_16'),
  durationSec: z.number().int().min(1).max(180).optional(),
  quality: z.enum(['DRAFT', 'STANDARD', 'HIGH']).default('STANDARD'),
  voiceConsentId: z.string().uuid().optional(),
  compositionId: z.string().uuid().optional(),
  sceneId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(4).max(120).optional(),
  requireLiveProvider: z.boolean().default(false),
});
export type CreateGenerativeJobRequest = z.infer<typeof CreateGenerativeJobRequestSchema>;

export const GenerativeJobDecisionRequestSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
  reviewerNotes: z.string().max(1000).optional(),
});
export type GenerativeJobDecisionRequest = z.infer<typeof GenerativeJobDecisionRequestSchema>;

export const CreateVoiceConsentRequestSchema = z.object({
  voiceOwnerName: z.string().min(2).max(120),
  voiceOwnerEmail: z.string().email().optional(),
  speakerLabel: z.string().min(2).max(80),
  consentScope: z.enum(['INTERNAL_PREVIEW', 'SINGLE_PROJECT', 'COMMERCIAL_CAMPAIGNS']),
  permittedUsage: z.string().min(5).max(500),
  attestationText: z.string().min(10).max(1000),
  expiresAt: z.string().datetime().optional(),
});
export type CreateVoiceConsentRequest = z.infer<typeof CreateVoiceConsentRequestSchema>;
