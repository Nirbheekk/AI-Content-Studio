# AI Content Operating System

AI-Native Content Creation, Remotion Video Rendering & Multi-Platform Publishing Platform ("Lovable for Content").

## Core Philosophy

**Describe it. Create it. Refine it. Publish it.**

Upload raw content folders, describe your creative outcome in plain English, and let a coordinated 9-agent production pipeline plan, script, compose, render via Remotion, visually inspect frames, refine, and schedule/publish across social platforms via Postiz.

---

## Monorepo Architecture

- `apps/web`: Next.js App Router frontend (AI Studio, Interactive Video Editor, Content Library, Publishing Center, Content Calendar).
- `apps/api`: Node.js TypeScript REST & Server-Sent Events (SSE) API Server.
- `apps/workers`: Isolated BullMQ workers (`worker`, `ai-orchestrator`, `media-worker`, `rendering-worker`, `publishing-worker`).
- `packages/shared`: Shared Zod schemas, `CompositionSpec` JSON AST, 12-stage workflow state machine, and typed DTO contracts.
- `packages/database`: Prisma ORM schema, PostgreSQL migrations, seed scripts, and AES-256-GCM credential encryption.
- `packages/ai-providers`: Provider-independent LLM, Vision, STT, TTS, ImageGen, and Embedding abstraction layer.
- `packages/remotion-engine`: Declarative JSON AST compiler, 16 motion design components, and 9 platform templates.
- `packages/integrations`: S3/MinIO object storage, Postiz REST publishing adapter, and Remotion Vision/Media MCP adapters.

---

## Docker Architecture (11 Services)

1. `frontend`: Next.js application (`:3000`)
2. `api`: Node.js REST & SSE API (`:4000`)
3. `postgres`: PostgreSQL 16 (`:5432`)
4. `redis`: Redis 7 cache, BullMQ & Pub/Sub (`:6379`)
5. `worker`: General background job processor (`:4010`)
6. `ai-orchestrator`: 9-Agent workflow state machine coordinator (`:4011`)
7. `media-worker`: FFmpeg media analysis, thumbnails, waveforms & transcription (`:4012`)
8. `rendering-worker`: Isolated, capability-dropped Remotion rendering sandbox (`:4013`)
9. `publishing-worker`: Postiz social publishing & scheduling worker (`:4014`)
10. `minio`: S3-compatible object storage (`:9000` API, `:9001` Console)
11. `nginx`: Reverse proxy (`:8080`)

---

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the Docker infrastructure:
   ```bash
   docker compose up -d
   ```
4. Run database migrations and seed data:
   ```bash
   pnpm run db:migrate
   pnpm run db:seed
   ```
5. Run verification tests:
   ```bash
   pnpm run typecheck
   pnpm run test
   ```

---

## Documentation Suite

- [System Specification](./SPEC.md)
- [Architecture Specification](./docs/ARCHITECTURE.md)
- [Database Schema & ERD](./docs/DATABASE_SCHEMA.md)
- [API Documentation](./docs/API_DOCUMENTATION.md)
- [External Integrations & Licensing Audit](./docs/INTEGRATIONS.md)
- [Development Roadmap](./docs/DEVELOPMENT_ROADMAP.md)
- [Project Status](./docs/PROJECT_STATUS.md)
- [Known Issues](./docs/KNOWN_ISSUES.md)
