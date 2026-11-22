# Phase 5 — Generative Media & Creative Asset Intelligence Audit

## Provider Capability & Boundary Audit
- **Google Gemini / Imagen / Veo (`google-gemini-media`)**: Image & video generation boundary declared; live execution requires `GEMINI_API_KEY`; SynthID provenance documented.
- **OpenAI Images & TTS (`openai-media`)**: Image & voiceover boundary declared; live execution requires `OPENAI_API_KEY`.
- **ElevenLabs Voice Studio (`elevenlabs-voice`)**: TTS, voiceover, SFX, and consent-gated voice cloning; live execution requires `ELEVENLABS_API_KEY`.
- **Runway Gen-3 / Gen-4 (`runway-gen`)**: Video generation & extension boundary; pricing explicitly marked `UNKNOWN` until account tier is configured; live execution requires `RUNWAY_API_SECRET`.
- **Local Deterministic Media & Audio Studio (`local-ffmpeg-audio-studio`)**: Local `$0.00` PNG/WAV generation and FFmpeg audio processing; always available without external credentials and explicitly tagged `SIMULATED` when substituting for external photo/video models.
