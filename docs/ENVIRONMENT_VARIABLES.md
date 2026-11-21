# Environment Variables Reference (`docs/ENVIRONMENT_VARIABLES.md`)

Never commit `.env` or `.env.production` to Git. In production (`docker-compose.prod.yml`), required secrets fail fast via `:?` validation.

| Variable | Required (Prod) | Description |
|---|---|---|
| `NODE_ENV` | Yes (`production`) | Runtime mode (`development`, `test`, `production`) |
| `POSTGRES_USER` | Yes | PostgreSQL database user |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password (min 24 chars in prod) |
| `POSTGRES_DB` | Yes | PostgreSQL database name (`ai_content_os`) |
| `DATABASE_URL` | Yes | Prisma connection string with `?schema=public&connection_limit=20` |
| `REDIS_PASSWORD` | Yes | Redis `requirepass` secret for BullMQ & rate limiting |
| `REDIS_URL` | Yes | Redis URL (`redis://:<password>@redis:6379`) |
| `MINIO_ROOT_USER` | Yes | MinIO root username |
| `MINIO_ROOT_PASSWORD` | Yes | MinIO root password |
| `S3_ENDPOINT` | Yes | Internal S3/MinIO URL (`http://minio:9000`) |
| `S3_PUBLIC_ENDPOINT` | Yes | Public S3/CDN URL for pre-signed asset links |
| `S3_ACCESS_KEY` | Yes | S3 access key |
| `S3_SECRET_KEY` | Yes | S3 secret key |
| `S3_BUCKET_RAW` | Yes | Raw uploads bucket (`aicos-raw-assets`) |
| `S3_BUCKET_DERIVATIVES` | Yes | Transcoded clips/thumbnails bucket (`aicos-derivatives`) |
| `S3_BUCKET_RENDERS` | Yes | Final rendered MP4 bucket (`aicos-renders`) |
| `JWT_SECRET` | Yes | Random >= 32-char secret for signing JWTs |
| `ENCRYPTION_MASTER_KEY` | Yes | 64-hex-char (32-byte) AES-256-GCM key for OAuth tokens |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated allowed origins (e.g. `https://app.example.com`) |
| `NEXT_PUBLIC_API_URL` | Yes | Public API base URL baked into Next.js standalone build |
| `NEXT_OUTPUT_STANDALONE` | Optional | Set `true` to force Next.js standalone output on Windows; enabled automatically on Linux/Docker |
| `GEMINI_API_KEY` | Optional | Google Gemini API key (falls back to `[SIMULATED]` if unset) |
| `OPENAI_API_KEY` | Optional | OpenAI API key |
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key |
| `ELEVENLABS_API_KEY` | Optional | ElevenLabs TTS key |
| `POSTIZ_API_URL` | Optional | External Postiz REST API endpoint |
| `POSTIZ_API_KEY` | Optional | External Postiz API key |
