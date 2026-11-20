---
name: external-api-integrations
description: >-
  Use this skill when integrating or maintaining external adapters for Postiz
  social publishing, S3/MinIO storage, Whisper STT, ElevenLabs TTS, LLM/Vision
  providers, or Remotion media/vision MCP services.
---

# External API Integrations Skill

## Responsibilities
- Build modular, provider-agnostic adapters in `packages/integrations` and `packages/ai-providers`.
- Integrate Postiz (`gitroomhq/postiz-app`) for social account OAuth, media upload, scheduling, publishing status tracking, and retry handling.
- Integrate S3/MinIO object storage, Whisper/STT transcription, ElevenLabs/TTS voice synthesis, and `remotion-media-mcp` / `remotion-vision-mcp` capabilities.

## Technical Standards
1. All external adapters must implement a clean TypeScript interface (`PublishingProvider`, `StorageProvider`, `STTProvider`, `TTSProvider`, `VisionInspectionProvider`).
2. Enforce request timeouts, exponential backoff retries, circuit breakers, and idempotency keys on all outbound HTTP calls.
3. Provide a deterministic `[SIMULATED]` fallback adapter when external credentials are not configured in local development, logging all simulated operations transparently.

## Implementation Workflow
1. Check `docs/INTEGRATIONS.md` for licensing, API contract, and credential requirements.
2. Implement the interface, live HTTP adapter, and simulated dev adapter.
3. Write contract tests covering success, rate limit (`429`), transient failure (`503`), and permanent error (`400`/`401`) responses.

## Validation Requirements
- Adapter unit and integration contract tests pass for both live-mocked HTTP responses and fallback simulation mode.
