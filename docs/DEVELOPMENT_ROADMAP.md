# Phased Development Roadmap (`docs/DEVELOPMENT_ROADMAP.md`)

Development is structured into incremental, empirically verified phases. No phase advances until all automated tests and Definition of Done criteria pass.

---

## Phase 0 & 0.2: Architecture, Engineering Environment & Monorepo Foundation (COMPLETED)
- [x] **Milestone 0.1 & 0.2**: Monorepo (`pnpm` + Turborepo), 8 workspace rules, 10 skills, 11-service Docker Compose stack, `packages/shared`, `packages/database` (Prisma schema, migrations, AES-256-GCM encryption, seed script).

---

## Phase 1: Working Foundation (COMPLETED)
- [x] **1.1 - 1.4**: Authentication (`scrypt`, JWT, refresh-token rotation), Workspace RBAC & invitations, Project CRUD, S3/MinIO upload pipeline with magic-byte verification, live Dashboard, and persistent AI Studio conversations + SSE streaming (30/30 tests passing).

---

## Phase 2: AI Production Engine (COMPLETED)
- [x] **2.1 - 2.5**: `@ai-content-os/ai-providers` (Gemini, OpenAI, Anthropic, Whisper, ElevenLabs + labeled fallback), media analysis & transcription pipeline, `@ai-content-os/remotion-engine` (9 templates, 16 components, AST compiler), 7-agent production pipeline, Visual QA auto-revision loop, and Human Approval Gate (37/37 tests passing).

---

## Phase 3: Advanced Creative Workflows (COMPLETED)
- [x] **3.1 Interactive Browser Video Editor (`/editor`)**:
  - Multi-track timeline editor (`ADD_SCENE`, `REMOVE_SCENE`, `REORDER_SCENES`, `UPDATE_SCENE`, `ADD_OVERLAY`, `REMOVE_OVERLAY`, `UPDATE_AUDIO`, `SET_DIMENSIONS`), granular AI single-scene editing (`POST /api/v1/compositions/:id/scenes/:sceneId/ai-edit`), and aspect ratio switcher (`9:16`, `16:9`, `1:1`, `4:5`).
- [x] **3.2 Content Repurposing Engine (`/repurpose`)**:
  - One-click transformation of a long-form asset into a multi-platform campaign batch (Instagram Reels, TikToks, YouTube Shorts, LinkedIn video posts, quote graphics, and written social posts).
- [x] **3.3 Brand Kit Deep Integration (`/brand-kit`)**:
  - Dedicated Brand Kit management workspace and 1-click Brand Kit application onto compositions (`POST /api/v1/compositions/:id/apply-brand-kit`).
- [x] **3.4 Media Inspection, Subtitles (SRT/VTT), Version Comparison & Collaboration Comments**:
  - Binary MP4/PNG/WAV media inspection (`inspectMp4Artifact`, `inspectPngArtifact`, `inspectWavArtifact`, `validateAudioCaptionSynchronization`), `.srt`/`.vtt` subtitle export, version diff comparison (`compareCompositionSpecs`), frame-pinned collaboration comments (`CompositionComment`), and approval history.
- [x] **3.5 Phase 3 Verification Gate**:
  - Verified end-to-end across 12 test suites (40/40 passing tests).

---

## Phase 4: Social Publishing & Content Calendar (NEXT)
- [ ] **4.1 Postiz Adapter & Encrypted Account Connections**:
  - OAuth connection workflow, AES-256-GCM token persistence, platform caption/hashtag generator, and strict Human Approval Checkpoint enforcement.
- [ ] **4.2 Publishing Worker & Idempotent Retry Engine**:
  - Scheduled and immediate publishing via `publishing-worker`, idempotency locks preventing duplicate posts, and exponential backoff retries.
- [ ] **4.3 Visual Content Calendar (`/calendar` & `/publish`)**:
  - Daily, weekly, and monthly views with platform filters, status badges (`DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `FAILED`), and drag-and-drop / interactive rescheduling.
- [ ] **4.4 Phase 4 Verification Gate**:
  - Automated tests verifying approval gate blocking unapproved posts, Postiz adapter contract, idempotency on retry, and calendar rescheduling persistence.

---

## Phase 5: Intelligence, Observability & Production Hardening
- [ ] **5.1 Analytics Agent & Performance Recommendations**
- [ ] **5.2 Cost Management, Quotas & Admin Monitoring**
- [ ] **5.3 Final Production Verification**
