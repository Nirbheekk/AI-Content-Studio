# Known Issues, Constraints & Mitigations (`docs/KNOWN_ISSUES.md`)

## 1. Host Environment Constraints

### KI-001: Windows PowerShell Script Execution Policy (`PSSecurityException`)
- **Severity**: Low (Resolved via Corepack `.cmd` shims)
- **Description**: On the Windows development host, PowerShell's execution policy blocks `.ps1` wrapper scripts (`npm.ps1`, `npx.ps1`, `pnpm.ps1`).
- **Mitigation**: Enabled Corepack `.cmd` shims in `C:\Users\user\AppData\Roaming\npm` (`pnpm.cmd`) and invoke commands via `pnpm.cmd` / `npm.cmd` on the Windows host or inside Linux Docker containers.

### KI-005: Docker Hub MinIO Image Relocation (`elestio/minio:latest`)
- **Severity**: Low (Resolved in `docker-compose.yml`)
- **Description**: Upstream `minio/minio:latest` on Docker Hub is restricted/removed for anonymous pulls.
- **Mitigation**: Configured `elestio/minio:latest` (verified S3-compatible MinIO server distribution with `/minio/health/live` health probe) in `docker-compose.yml`.

### KI-006: Docker Desktop WSL2 Parallel Build Resource Contention
- **Severity**: Low (Resolved via Shared Worker Image Tag)
- **Description**: Building 7 Node/Alpine images simultaneously in parallel can saturate the Docker Desktop WSL2 engine during image layer unpacking.
- **Mitigation**: Assigned shared image tag `aicos-worker:latest` across the 4 general BullMQ worker services (`worker`, `ai-orchestrator`, `media-worker`, `publishing-worker`) so `docker/worker.Dockerfile` is built once and shared cleanly.

## 2. Licensing & Legal Boundaries

### KI-002: Postiz AGPL-3.0 License Boundary
- **Severity**: Architectural Constraint (Mitigated by Design)
- **Description**: The upstream `gitroomhq/postiz-app` repository is licensed under AGPL-3.0.
- **Mitigation**: Communicate with Postiz strictly as an external HTTP REST service (`POSTIZ_API_URL`). No Postiz source code is bundled in this repository.

### KI-003: Remotion Commercial Company License Threshold
- **Severity**: Commercial Deployment Notice
- **Description**: Remotion is free for individuals and organizations with `<= 3` people; organizations with `>= 4` people require a paid Remotion Company License.
- **Mitigation**: Documented in `docs/INTEGRATIONS.md` and `README.md`.

## 3. External Service Credentials in Local Development

### KI-004: Third-Party SaaS API Keys (OpenAI, Gemini, ElevenLabs, Postiz)
- **Severity**: Informational (Mitigated by Adapter Fallback)
- **Description**: Local development and CI runs may operate without external paid SaaS API keys.
- **Mitigation**: The AI Provider and Integration layers default to deterministic `SimulatedProviderAdapter` implementations labeled `[SIMULATED]` when external keys are omitted.

## 4. Phase 4 Publishing Limitations

### KI-007: Postiz Sandbox Fallback Is Not a Real Publication
- **Severity**: High (disclosure requirement)
- **Description**: Without POSTIZ_API_KEY the adapter runs a labeled sandbox (isSimulated = true, provider postiz-sandbox-fallback). Posts reaching PUBLISHED in this mode were NOT sent to any social network. The UI shows [SIMULATED SANDBOX].
- **Mitigation**: Set POSTIZ_API_URL and POSTIZ_API_KEY to enable live mode.

### KI-008: Live Postiz Endpoints Unverified Against a Running Postiz Instance
- **Severity**: Medium
- **Description**: The live-mode REST paths (/v1/posts, /v1/integrations/oauth/exchange, /v1/integrations/oauth/refresh) were written to the adapter contract but not exercised against a real Postiz deployment. Real Postiz handles OAuth via its own UI/provider apps, so path and payload mapping must be confirmed.
- **Mitigation**: Validate against the Postiz public API docs before production.

### KI-009: OAuth Code Exchange Is a Dev Flow
- **Severity**: Medium
- **Description**: The /publish modal generates a placeholder code instead of completing a real provider redirect and callback. Real connections need per-platform developer apps (client ID and secret) and a callback route.
- **Mitigation**: Implement redirect callback handling in the live-integration phase.

### KI-010: Worker Publishing Path Is Simplified
- **Severity**: Medium
- **Description**: The BullMQ publish.execute processor in apps/workers confirms posts via sandbox logic and does not call the live adapter, auto-refresh tokens, or re-enqueue retries. Delayed scheduled jobs persist in Redis across restarts, but live-provider execution from the worker is not implemented. Immediate publish and manual retry run through the API service.
- **Mitigation**: Move executePostPublication into a shared package used by both API and worker.

### KI-011: Provider Status Polling and Workspace Default Timezone
- **Severity**: Low
- **Description**: Posts left in PROCESSING are not polled for final confirmation. Timezone is chosen per post and calendar view; Workspace.timezone exists in the schema but is not yet used as a default.
- **Mitigation**: Add a status-sync job and a workspace timezone setting.

## 5. Phase 5 Analytics, Intelligence & Observability Disclosures

### KI-012: Social Provider Metric Variations & Explicit Unavailable Handling
- **Severity**: Low (Platform Constraint Mitigated by Design)
- **Description**: Social media platforms vary widely in their public analytics APIs (e.g., video watch time is unavailable on text posts; impressions vs reach semantics vary between Instagram and X/Twitter). Without live connected accounts or API permissions, provider metric responses return empty or unsupported subsets.
- **Mitigation**: The system explicitly stores unavailable metrics as `null` and records the exact reason in `unavailableReason` (`UNSUPPORTED_BY_PLATFORM`, `NOT_CONFIGURED`, `RATE_LIMITED`). Metrics are never fabricated or guessed. Users can import verified metrics via `POST /api/v1/analytics/import` (flagged `MANUAL_IMPORT`).

### KI-013: Billing Draft Invoices Marked ESTIMATED
- **Severity**: Commercial Disclosure Notice
- **Description**: Generated invoices (`POST /api/v1/billing/invoices/generate`) are draft cost accounting calculations based on base unit rates (LLM token count, Remotion rendering time, S3 storage volume). They do not represent completed credit card transactions or Stripe charges.
- **Mitigation**: All generated invoices strictly store and display `costKind: 'ESTIMATED'` and `status: 'DRAFT'` until an external billing provider (e.g. Stripe webhook) is connected.

## 6. Phase 6 & 7 Infrastructure & Dependency Audit Disclosures

### KI-014: Dependency Security Audit Findings (RESOLVED in Phase 7)
- **Severity**: High -> **RESOLVED**
- **Description**: Phase 6 `pnpm audit --audit-level=high` reported 62 advisories (5 low, 32 moderate, 17 high, 8 critical), including `next@15.1.0` (`GHSA-9qr9-h5gf-34mp`, `GHSA-f82v-jwr5-mffw`, `GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`, `GHSA-2464-fhr4-w9xw`, `GHSA-p3m5-59mp-jv5r`), `postcss`, `sharp`, `zod@3.23.8` (`GHSA-mrhx-c7xc-m3w5`), and dev-only `vitest@2.1.9` / `tinypool` / `vite` / `esbuild`.
- **Resolution (Phase 7)**:
  - Upgraded `next` `15.1.0` -> `15.5.29` (with `@img/sharp-*` `0.35.5`).
  - Upgraded `zod` `3.23.8` -> `4.6.7` (updated `z.record(z.string(), z.unknown())` in `packages/shared/src/composition.ts`).
  - Upgraded `vitest` `2.1.9` -> `4.1.12` (devDependencies only).
  - Scoped `next>postcss` override to `^8.5.23` (`8.5.33`) in `pnpm-workspace.yaml`.
  - Stripped unused `npm`/`corepack` from all 4 production Docker `runner` stages.
  - Verified `pnpm audit` = **0 vulnerabilities** and Trivy (`CRITICAL,HIGH --ignore-unfixed`) = **0 vulnerabilities / 0 secrets** across all 4 production images.
