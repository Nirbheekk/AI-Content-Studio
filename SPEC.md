# AI Content Operating System — Master System Specification (`SPEC.md`)

- **Status**: `FINALIZED`
- **Version**: `1.0.0`
- **Architecture Pattern**: Monorepo, Micro-Worker Queue Architecture, Declarative Remotion Composition AST, Persistent Multi-Agent State Machine

---

## 1. Executive Summary

The **AI Content Operating System** ("Lovable for Content") is an AI-native SaaS platform that transforms raw uploaded media folders and natural-language creative briefs into professionally edited multi-platform videos, motion graphics, and scheduled social campaigns.

Core workflow lifecycle:
`Upload -> Understand -> Plan -> Create -> Render -> Inspect -> Refine -> Approve -> Publish`

---

## 2. Monorepo Structure

```text
ai-content-studio/
├── .agents/
│   ├── rules/                         # 8 persistent workspace engineering rules
│   └── skills/                        # 10 specialized Antigravity engineering skills
├── apps/
│   ├── web/                           # Next.js (App Router), React, Tailwind, shadcn/ui, Framer Motion, @remotion/player
│   ├── api/                           # Node.js TypeScript REST + SSE API Server (Fastify/Express, Zod, JWT, RBAC)
│   └── workers/                       # BullMQ isolated worker entrypoints
│       ├── src/
│       │   ├── worker.ts              # General background job processor (notifications, cleanup, usage aggregation)
│       │   ├── ai-orchestrator.ts     # 9-Agent workflow state machine coordinator
│       │   ├── media-worker.ts        # FFmpeg metadata, thumbnails, waveforms, STT transcription, scene detection
│       │   ├── rendering-worker.ts    # Isolated sandboxed Remotion headless renderer & frame extractor
│       │   └── publishing-worker.ts   # Postiz publishing, scheduling, status polling & retry worker
├── packages/
│   ├── shared/                        # Shared TypeScript interfaces, Zod schemas, Composition AST, workflow enums, error codes
│   ├── database/                      # Prisma schema, migrations, seed scripts, transactional repositories
│   ├── ai-providers/                  # Provider-independent LLM, Vision, STT, TTS, ImageGen, Embedding abstraction + cost tracker
│   ├── remotion-engine/               # Declarative JSON AST compiler, 16 motion design components, 9 platform templates
│   └── integrations/                  # Modular adapters: S3/MinIO, Postiz publishing, remotion-vision-mcp, remotion-media-mcp
├── docker/
│   ├── web.Dockerfile
│   ├── api.Dockerfile
│   ├── worker.Dockerfile
│   ├── rendering-worker.Dockerfile
│   └── nginx/
│       └── nginx.conf
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_DOCUMENTATION.md
│   ├── INTEGRATIONS.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── KNOWN_ISSUES.md
│   └── PROJECT_STATUS.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .dockerignore
├── Makefile
├── AGENTS.md
├── SPEC.md
├── STATE.md
├── package.json
└── tsconfig.base.json
```

---

## 3. Core Functional Specifications

1. **Multi-Tenant Workspace & Brand Kit**: Role-based access (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`), encrypted credentials, and persistent Brand Kits (logos, palettes, typography, tone of voice, editing style, caption presets).
2. **Content Library & Asset Pipeline**: Folder & multipart uploads to S3/MinIO, magic-byte validation, SHA-256 duplicate detection, FFmpeg metadata/thumbnails/waveforms, Whisper word-level transcription, speaker diarization tags, and AI scene/B-roll tagging.
3. **AI Studio (Conversational 3-Pane Workspace)**: Left asset/project/history rail, center conversational prompt + live multi-agent production plan, right instant `@remotion/player` preview + composition inspector + platform variations.
4. **Declarative Composition AST & Versioned Editing**: Strict Zod-validated JSON specification (`CompositionSpec`) compiled into Remotion compositions. Supports partial scene edits, undo/redo immutable version history (`CompositionVersion`), and interactive timeline editing.
5. **9-Agent Persistent Workflow Engine**:
   - Stage transitions persisted in PostgreSQL (`PENDING` -> `ANALYZING` -> `PLANNING` -> `SCRIPTING` -> `COMPOSING` -> `RENDERING` -> `REVIEWING` -> `REVISING` -> `AWAITING_APPROVAL` -> `APPROVED` -> `SCHEDULED` -> `PUBLISHED`, plus `FAILED` / `CANCELLED`).
   - Automated visual QA loop inspecting rendered frames for text overflow, contrast, alignment, and blank frames before surfacing to the user at `AWAITING_APPROVAL`.
6. **Social Publishing & Content Calendar**: Postiz integration adapter with AES-256-GCM encrypted social tokens, human approval gate, drag-and-drop calendar scheduling, and idempotent retry handling.

---

## 4. Verification & Definition of Done

Every feature requires:
1. Functional frontend UI with loading, empty, and error states.
2. Zod-validated backend REST/SSE API.
3. Transactional PostgreSQL persistence via Prisma.
4. Workspace RBAC enforcement.
5. Automated unit, integration, and E2E tests passing.
6. Updated status in `docs/PROJECT_STATUS.md` and `STATE.md`.
