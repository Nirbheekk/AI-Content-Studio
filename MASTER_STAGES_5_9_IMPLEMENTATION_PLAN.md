# Master Implementation Plan — Stages 5–9

## Execution Order & Checkpoints
Each stage follows: **Audit → Additive Schema (if needed) → Shared Contracts → Engine/Services → API Routes → Frontend UI (100% semantic tokens) → Automated Tests → Quality Gates (`typecheck`, `lint`, `test`, `build`) → Reports & `STATE.md` → Git Commit & Push**.

1. **Stage 5 — Generative Media & Creative Asset Intelligence**
   - Additive Prisma models: `GenerativeAssetJob`, `VoiceConsentRecord`.
   - Shared contracts: `packages/shared/src/stage5.ts` (Provider Capability Registry for OpenAI, Anthropic, Google Gemini/Veo/Imagen, ElevenLabs, Runway, Local FFmpeg/Edge-TTS; generative job & voice consent schemas).
   - Services & routes: `apps/api/src/services/generative-media.service.ts`, `apps/api/src/routes/generative.routes.ts`.
   - Frontend: `GenerativeMediaStudio` panel integrated into `/studio` + provenance filter in `/library`.
   - Tests: `apps/api/src/__tests__/stage5-generative-media.test.ts`.
   - Reports: `PHASE_5_GENERATIVE_MEDIA_AUDIT.md`, `PHASE_5_IMPLEMENTATION_REPORT.md`, `PHASE_5_ACCEPTANCE_REPORT.md`.

2. **Stage 6 — Autonomous Creative Campaigns & Agent Orchestration**
   - Additive Prisma models: `Campaign`, `CampaignDeliverable`, `CampaignTask`.
   - Shared contracts: `packages/shared/src/stage6.ts` (Campaign lifecycle state machine, NL brief parser, Creative Strategy, Content Matrix, Production DAG nodes & transitions).
   - Services & routes: `apps/api/src/services/campaign-orchestrator.service.ts`, `apps/api/src/routes/campaigns.routes.ts`.
   - Frontend: `/campaigns` workspace page + nav link in `AppShell` (overview, brief, strategy, content matrix, DAG task graph, deliverable gallery, cost/budget, review & approval).
   - Tests: `apps/api/src/__tests__/stage6-campaigns.test.ts`.
   - Reports: `PHASE_6_CAMPAIGNS_AUDIT.md`, `PHASE_6_IMPLEMENTATION_REPORT.md`, `PHASE_6_ACCEPTANCE_REPORT.md`.

3. **Stage 7 — Client Collaboration, Review & Approval Workflows**
   - Additive Prisma models: `ReviewLink`, `ApprovalRecord`, `Notification`.
   - Shared contracts: `packages/shared/src/stage7.ts`.
   - Services & routes: `apps/api/src/services/collaboration.service.ts`, `apps/api/src/routes/collaboration.routes.ts` (authenticated link management, approval chains, notifications + public token-validated client review endpoints).
   - Frontend: Public client review route `/review/[token]` (video player, timestamped comments, approve/request changes without workspace leakage) + Review Links & Notifications panel in `/editor` and `/campaigns`.
   - Tests: `apps/api/src/__tests__/stage7-collaboration.test.ts`.
   - Reports: `PHASE_7_COLLABORATION_AUDIT.md`, `PHASE_7_IMPLEMENTATION_REPORT.md`, `PHASE_7_ACCEPTANCE_REPORT.md`.

4. **Stage 8 — Distribution, Publishing Intelligence & Analytics**
   - Shared contracts: `packages/shared/src/stage8.ts` (6-platform Capability Registry, deliverable validator, analytics provenance & content intelligence insights).
   - Services & routes: `apps/api/src/services/distribution-intelligence.service.ts`, `apps/api/src/routes/distribution.routes.ts` (platform capabilities, pre-publish deliverable validation, calendar reschedule endpoint, authorized metric import/provenance, content intelligence insights & campaign recommendations).
   - Frontend: Platform capability validator in `/publish`, interactive rescheduling in `/calendar`, provenance-labeled analytics & content intelligence insights in `/analytics`.
   - Tests: `apps/api/src/__tests__/stage8-distribution.test.ts`.
   - Reports: `PHASE_8_DISTRIBUTION_AUDIT.md`, `PHASE_8_IMPLEMENTATION_REPORT.md`, `PHASE_8_ACCEPTANCE_REPORT.md`.

5. **Stage 9 — Final SOTA Integration, Security, Reliability & Product Acceptance**
   - Full cross-stage E2E test suite verifying Journeys A–F.
   - Security, dependency (`pnpm audit`), secret scan, Docker compose config validation, full `typecheck`/`lint`/`test`/`build`.
   - Final release suite: `FINAL_SOTA_PRODUCT_AUDIT.md`, `FINAL_SOTA_ACCEPTANCE_REPORT.md`, `FINAL_SECURITY_AUDIT.md`, `FINAL_KNOWN_LIMITATIONS.md`, `FINAL_EXTERNAL_DEPENDENCIES.md`, `FINAL_RELEASE_CHECKLIST.md`, updated `README.md` and `STATE.md`.
