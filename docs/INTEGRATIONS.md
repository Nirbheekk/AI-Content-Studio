# External Repositories, Licensing Audit & Adapter Integrations (`docs/INTEGRATIONS.md`)

## 1. Repository Compatibility & Licensing Audit

Per Section 1 and Section 10 of the Master Directive, each referenced repository was evaluated for licensing, dependency conflicts, and integration strategy before writing code. **We do not blindly merge conflicting repositories into one monolith; we integrate their capabilities through clean modular adapters in `packages/remotion-engine` and `packages/integrations`.**

| Repository / Tool | Primary Capability | License & Commercial Considerations | Dependency / Conflict Analysis | Integration Strategy |
|-------------------|--------------------|-------------------------------------|--------------------------------|----------------------|
| **Remotion (`remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/cli`)** | Core React programmatic video engine, player & headless Chromium renderer | **Remotion License** (Free for individuals & companies with <= 3 people; requires paid Company License for commercial entities with >= 4 people) | Requires pinned matching versions across all `@remotion/*` packages (e.g., `4.0.x`) and React 18/19 alignment | Lock exact version across `packages/remotion-engine`, `apps/web`, and `apps/workers` (`rendering-worker`) |
| **`gyoridavid/short-video-maker`** | Script-to-video pipeline, TTS + Whisper word-level caption synchronization, REST/MCP server | MIT License | Standalone server bundles heavy local Kokoro TTS / Whisper binaries & Remotion v4 setup that would conflict if vendored raw | Extract its **Script-to-Scene + Word-Timestamp Caption Alignment pattern** into `ScriptwriterAgent` and `media-worker` + optional REST/MCP bridge adapter |
| **`IBM/chuk-motion`** | Structured motion graphics, multi-track layouts, data-driven charts & design tokens | Apache-2.0 License | Python/MCP generator + Remotion templates; direct Python runtime not needed inside Node monorepo | Port its **Design Token system, Multi-Track Timeline layout grid, and Data Chart components** into `packages/remotion-engine/src/components/` |
| **`Remocn/remocn`** | Prebuilt shadcn-style copy-paste Remotion components & motion primitives | MIT License | Copy-paste component registry philosophy (similar to `shadcn/ui`) | Adopt directly as the pattern for our **16 internal Remotion design system components** in `packages/remotion-engine` |
| **`instincthub/remotion-create-video`** | Talking-head video editing, multi-aspect-ratio (`9:16`, `16:9`, `1:1`, `4:5`) responsive scaling, explainer layouts | MIT License | Older Remotion config scripts if imported whole | Adapt its **Multi-Aspect-Ratio Safe-Zone Layout Engine & Talking-Head / Split-Screen framing components** |
| **`haidrrrry/claude-remotion-skill`** | Professional motion choreography rules, spring physics presets, kinetic typography, word-synced captions | MIT / Skill Specification | Markdown instruction skill + reference motion patterns | Embed its **spring physics parameters (`damping`, `stiffness`, `mass`), transition choreography, and safe-zone typography rules** into `MotionDesignerAgent` prompts and `.agents/skills/remotion-video-engineering/SKILL.md` |
| **`remotion-media-mcp` & `remotion-vision-mcp`** | Generative media asset creation & visual frame inspection for QA defect detection | MIT / MCP Protocol | Standard MCP JSON-RPC / tool schema | Wrap in `VisionInspectionAdapter` and `MediaGenerationAdapter` in `packages/integrations`, invoked by `QualityAssuranceAgent` during the `REVIEWING` stage |
| **`gitroomhq/postiz-app`** | Multi-platform social account OAuth, media upload, post scheduling, retry & analytics | **AGPL-3.0** (Self-hosted repo) / Public REST API | **CRITICAL LICENSE BOUNDARY**: Importing AGPLv3 source code directly into our codebase would taint our proprietary SaaS code with AGPLv3 obligations | **Strict Network Boundary**: Integrate Postiz exclusively over HTTP REST API via `PostizPublishingAdapter` in `packages/integrations` (or run Postiz as an isolated external service/container). Zero Postiz source code is copied into our monorepo |

---

## 2. External API Credentials & Infrastructure Requirements

All external credentials are injected via `.env` (documented in `.env.example`) and never hardcoded or exposed to the browser.

### 2.1 Core Infrastructure (Self-Contained in Docker Compose)
- **PostgreSQL 16**: `DATABASE_URL=postgresql://aicos:aicos_dev_password@postgres:5432/ai_content_os`
- **Redis 7**: `REDIS_URL=redis://redis:6379`
- **MinIO (S3-Compatible Object Storage)**:
  - `S3_ENDPOINT=http://minio:9000`
  - `S3_PUBLIC_ENDPOINT=http://localhost:9000`
  - `S3_ACCESS_KEY=minioadmin`
  - `S3_SECRET_KEY=minioadmin_secret`
  - `S3_BUCKET_RAW=aicos-raw-assets`
  - `S3_BUCKET_DERIVATIVES=aicos-derivatives`
  - `S3_BUCKET_RENDERS=aicos-renders`

### 2.2 Security & Cryptography Secrets
- `JWT_SECRET`: 32+ byte high-entropy signing key for API authentication tokens.
- `ENCRYPTION_MASTER_KEY`: 64-hex-character (256-bit) key used by AES-256-GCM to encrypt Postiz/Social OAuth tokens and workspace API keys at rest.

### 2.3 External AI & Publishing Providers (With Automatic Dev Simulation Fallback)
When any external API key below is omitted in local development, the platform automatically activates the corresponding `SimulatedProviderAdapter` (clearly badged `[SIMULATED]` in API responses and UI) so the entire `Upload -> Understand -> Plan -> Create -> Render -> Inspect -> Refine -> Approve -> Publish` pipeline remains 100% runnable offline:

| Capability | Environment Variables | Default Live Provider | Fallback When Unset |
|------------|-----------------------|-----------------------|---------------------|
| **LLM & Creative Reasoning** | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Google Gemini / OpenAI / Anthropic | `SimulatedLLMProvider` (deterministic schema-valid JSON outputs) |
| **Visual Frame QA (`remotion-vision-mcp`)** | `GEMINI_API_KEY` or `VISION_MCP_ENDPOINT` | Gemini Multimodal Vision / Vision MCP | `SimulatedVisionQAProvider` (analyzes AST bounds & frame dimensions) |
| **Speech-to-Text (Transcription)** | `OPENAI_API_KEY` or `WHISPER_API_URL` | OpenAI Whisper (`whisper-1`) | `SimulatedWhisperProvider` (generates word-timestamped segments) |
| **Text-to-Speech (Voiceover)** | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | ElevenLabs API v1 | `SimulatedTTSProvider` (synthesizes valid WAV/MP3 audio via FFmpeg sine/speech tone) |
| **Social Publishing (Postiz)** | `POSTIZ_API_URL`, `POSTIZ_API_KEY` | Postiz Public API (`https://api.postiz.com/public/v1` or self-hosted) | `SimulatedPostizAdapter` (persists full schedule/publish lifecycle & status transitions locally) |
