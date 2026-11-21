export interface VideoClipGenerationRequest {
  prompt: string;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  durationSec: number;
  referenceImageUrl?: string;
}

export interface VideoClipGenerationResult {
  provider: 'gemini-veo' | 'simulated-motion-broll';
  model: string;
  isSimulated: boolean;
  videoUrl: string | null;
  motionDirective: {
    cameraMove: 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left';
    pacing: 'fast' | 'medium' | 'cinematic';
    promptUsed: string;
  };
  latencyMs: number;
}

/**
 * Provider-agnostic generative video B-roll adapter.
 * Uses Gemini Veo / Omni Flash when GEMINI_API_KEY and ENABLE_LIVE_VIDEO_GEN=true are configured;
 * otherwise returns deterministic motion directives for Ken Burns / Remotion motion synthesis.
 */
export class GenerativeVideoProvider {
  public async generateSceneClip(
    request: VideoClipGenerationRequest,
  ): Promise<VideoClipGenerationResult> {
    const start = performance.now();
    const apiKey = process.env['GEMINI_API_KEY'];
    const model = process.env['VEO_MODEL'] ?? 'veo-2.0-generate-001';
    const liveEnabled = process.env['ENABLE_LIVE_VIDEO_GEN'] === 'true';

    if (apiKey && liveEnabled) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: request.prompt }],
            parameters: {
              aspectRatio: request.aspectRatio,
              durationSeconds: Math.max(4, Math.min(8, Math.round(request.durationSec))),
            },
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (response.ok) {
          const payload = (await response.json()) as { name?: string };
          return {
            provider: 'gemini-veo',
            model,
            isSimulated: false,
            videoUrl: payload.name ? `operation://${payload.name}` : null,
            motionDirective: {
              cameraMove: 'zoom-in',
              pacing: 'cinematic',
              promptUsed: request.prompt,
            },
            latencyMs: Math.round(performance.now() - start),
          };
        }
      } catch {
        // Fall through to deterministic motion directive
      }
    }

    const lower = request.prompt.toLowerCase();
    const cameraMove = lower.includes('pour') || lower.includes('splash')
      ? 'zoom-out'
      : lower.includes('celebrat') || lower.includes('pan')
        ? 'pan-right'
        : 'zoom-in';

    return {
      provider: 'simulated-motion-broll',
      model: 'ken-burns-motion-v2',
      isSimulated: true,
      videoUrl: null,
      motionDirective: {
        cameraMove,
        pacing: request.durationSec <= 4 ? 'fast' : 'cinematic',
        promptUsed: request.prompt,
      },
      latencyMs: Math.round(performance.now() - start),
    };
  }
}
