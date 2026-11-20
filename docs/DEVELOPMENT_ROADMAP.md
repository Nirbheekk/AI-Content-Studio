# Phased Development Roadmap (`docs/DEVELOPMENT_ROADMAP.md`)

Development is structured into incremental, empirically verified phases. No phase advances until all automated tests and Definition of Done criteria pass.

---

## Phase 0: Architecture, Engineering Environment & Monorepo Foundation (COMPLETED)
- [x] **Milestone 0.1**: Inspect repository and host runtime (`Node v24.20.0`, `pnpm 12.21.0`, `Docker 29.9.3`, `Compose v5.5.1`). Configure `.agents/rules/` (8 rules), `.agents/skills/` (10 skills), `AGENTS.md`, `SPEC.md`, `STATE.md`, and `docs/*` suite.
- [x] **Milestone 0.2**:
  - Configured `pnpm` workspaces, Turborepo, strict TypeScript (`tsconfig.base.json`), ESLint, Prettier, `.env.example`, `.gitignore`, `.dockerignore`, `Makefile`, and `README.md`.
  - Implemented 11-service `docker-compose.yml` and `docker-compose.prod.yml` (`postgres`, `redis`, `minio`, `api`, `frontend`, `worker`, `ai-orchestrator`, `media-worker`, `rendering-worker`, `publishing-worker`, `nginx`) and verified all 11 containers `Up (healthy)`.
  - Implemented `packages/shared` (`CompositionSpec` AST, 14-stage workflow state machine, partial AST patch engine, shared contracts, domain errors) + unit tests.
  - Implemented `packages/database` (20-model Prisma schema, initial PostgreSQL migration `20261120170336_init`, AES-256-GCM credential encryption, idempotent seed script) + unit & DB integration tests.
  - Implemented initial `apps/api`, `apps/workers`, and `apps/web` services with health endpoints and 18/18 passing tests.

---

## Phase 1: Working Foundation (NEXT)
- [ ] **1.1 Authentication & Workspace Isolation**:
  - User registration, login, JWT session auth, Workspace RBAC middleware (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`), and audit logging.
- [ ] **1.2 Projects & Content Library**:
  - Folder and multipart file upload pipeline backed by S3/MinIO pre-signed URLs, magic-byte MIME validation, SHA-256 duplicate detection, and project organization.
- [ ] **1.3 Dashboard & AI Studio Foundation**:
  - Minimalist dark-first SaaS shell, Dashboard overview, Content Library explorer, and 3-pane AI Studio with persistent projects, conversations, and messages.
- [ ] **1.4 Phase 1 Verification Gate**:
  - Unit tests, API/DB integration tests, and Playwright E2E tests for Auth -> Workspace -> Project -> Upload -> Persistent AI Conversation.

---

## Phase 2: AI Production Engine
- [ ] **2.1 Asset Intelligence Pipeline (`media-worker`)**:
  - FFmpeg metadata extraction, thumbnail & waveform generation, STT word-timestamped transcription, speaker identification, and scene/hook scoring.
- [ ] **2.2 Provider Abstraction & Core Agents (`packages/ai-providers`)**:
  - Provider registry with token/cost tracking and fallback support; implementation of Content Intelligence, Creative Director, Scriptwriter, Video Editor, and Motion Designer agents.
- [ ] **2.3 Remotion Composition Compiler & Player (`packages/remotion-engine`)**:
  - Declarative `CompositionSpec` JSON AST compiler, live `@remotion/player` preview in AI Studio right panel, partial conversational edits, and immutable `CompositionVersion` undo/redo.
- [ ] **2.4 Isolated Rendering Worker (`rendering-worker`)**:
  - Headless Remotion MP4 rendering in sandboxed worker with SSE real-time progress bar and signed MP4 download/preview.
- [ ] **2.5 Phase 2 Verification Gate**:
  - End-to-end test: Upload clip -> Prompt AI Studio -> Generate Composition AST -> Preview in Player -> Conversational partial edit -> Headless MP4 render.

---

## Phase 3: Advanced Creative Workflows
- [ ] **3.1 Visual Quality Assurance Loop (`remotion-vision-mcp` + Agent 7)**
- [ ] **3.2 Complete 16-Component Video Design System & 9 Platform Templates**
- [ ] **3.3 Interactive Browser Video Editor & Brand Kit**
- [ ] **3.4 Content Repurposing Engine**
- [ ] **3.5 Phase 3 Verification Gate**

---

## Phase 4: Social Publishing & Content Calendar
- [ ] **4.1 Postiz Adapter & Encrypted Account Connections**
- [ ] **4.2 Publishing Worker & Idempotent Retry Engine**
- [ ] **4.3 Visual Content Calendar**
- [ ] **4.4 Phase 4 Verification Gate**

---

## Phase 5: Intelligence, Observability & Production Hardening
- [ ] **5.1 Analytics Agent & Performance Recommendations**
- [ ] **5.2 Cost Management, Quotas & Admin Monitoring**
- [ ] **5.3 Final Production Verification**
