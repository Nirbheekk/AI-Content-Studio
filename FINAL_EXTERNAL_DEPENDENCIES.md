# Final External Dependencies Register

| Capability | Provider / Platform | Required Environment Variable(s) | Approval / Licensing Requirement |
|---|---|---|---|
| Live Image & Video Gen | Google Gemini / Imagen / Veo | `GEMINI_API_KEY` | Google AI Studio billing enabled |
| Live Image & TTS Gen | OpenAI | `OPENAI_API_KEY` | OpenAI API account |
| Live Voice & Cloning | ElevenLabs | `ELEVENLABS_API_KEY` | Paid commercial tier + `ACTIVE` `VoiceConsentRecord` |
| Live Gen-3 / Gen-4 Video | Runway | `RUNWAY_API_SECRET` | Paid Runway API plan |
| Live Social Publishing & Insights | Postiz / Meta / TikTok / YouTube / LinkedIn / X | `POSTIZ_API_KEY` + platform OAuth client secrets | Meta App Review, TikTok Content Posting audit, Google OAuth verification, LinkedIn Marketing approval, X API Basic/Pro |
| Production Redis & CORS | Infrastructure | `REDIS_PASSWORD`, `CORS_ALLOWED_ORIGINS`, `ENCRYPTION_MASTER_KEY`, `JWT_SECRET` | Required by `docker-compose.prod.yml` |
