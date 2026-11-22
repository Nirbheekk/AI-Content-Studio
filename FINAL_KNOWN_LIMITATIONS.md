# Final Known Limitations

1. **External Generative Cloud Models (Imagen/Veo, OpenAI Image/TTS, ElevenLabs, Runway)**: Without live API keys in `.env`, external providers honestly report `PENDING_CREDENTIALS` (or `UNAVAILABLE` when `requireLiveProvider: true`) and local fallback outputs are explicitly labeled `SIMULATED` / `[SIMULATED]`.
2. **Direct Social Publishing & Live Platform Metrics**: Instagram, Facebook, TikTok, YouTube, LinkedIn, and X operate in `SANDBOX_SIMULATED` mode until `POSTIZ_API_KEY` and approved platform OAuth apps/scopes are configured. Uncollected metrics are explicitly marked `UNAVAILABLE` and never fabricated.
3. **Runway Per-Second Pricing**: Explicitly labeled `UNKNOWN` until workspace plan credit pricing is configured.
4. **Email Notifications**: In-app notifications (`Notification` table with `dedupeKey` idempotency) are active; outbound email delivery is intentionally disabled until an SMTP/transactional email provider is configured.
5. **Local Docker Only**: No public cloud hosting, domain, TLS certificate, or paid production infrastructure has been provisioned.
