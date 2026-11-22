# Stage 2 Foundation — End-to-End Acceptance Report

**Date**: 2026-11-22  
**Environment**: Local PostgreSQL (`ai_content_os`), Redis, MinIO, Fastify API, Next.js Web, Docker Compose.

## 1. Quality Gate Results

| Gate | Command | Result | Evidence |
|---|---|---|---|
| **Prisma Sync & Generate** | `prisma db push --skip-generate && prisma generate` | **PASS** | `MediaRightsRecord` & `BudgetPolicy` synced in 461ms; Prisma Client v5.22.0 generated. |
| **Typecheck** | `pnpm.cmd run typecheck` | **PASS** | `13/13` Turborepo tasks, `0` errors. |
| **Lint** | `pnpm.cmd run lint` | **PASS** | `0` errors, `0` warnings (`--max-warnings 0`). |
| **Unit & Integration Tests** | `pnpm.cmd --env-file=.env run test` | **PASS** | `13/13` Turborepo tasks; `apps/api` `10/10` suites (`23/23` tests including `stage2-foundation.test.ts`); `packages/remotion-engine` (`signal-qa.test.ts` `3/3`, `video-probe.test.ts` `4/4`); `apps/web` `3/3`. |
| **Production Build** | `pnpm.cmd run build` | **PASS** | All `8/8` packages built cleanly (`18/18` Next.js routes). |

## 2. Journey Verification Summary

- **Journey A (Bulk Folder Upload)**: Verified `BulkFolderUploader` (`webkitdirectory` + drag-and-drop + relative folder path derivation + progress + cancel + retry) and server `folderPath` preservation (`/raw-clips/shoot-day-1/broll`) in `stage2-foundation.test.ts`.
- **Journey B (Media Rights)**: Verified all states (`UNKNOWN`, `VERIFIED`, `ALLOWED_WITH_ATTRIBUTION`, `EXPIRED`, `RESTRICTED`, `REVOKED`, `VOICE_CLONED` unverified consent, territory restriction, cross-workspace `404` isolation).
- **Journey C (Publishing Rights Gate)**: Verified `POST /api/v1/publishing/rights-check` blocks unknown rights when `requireVerifiedRights: true`, allows verified attribution rights, and `executePostPublication` re-evaluates rights before publishing.
- **Journey D (Pre-Flight Cost Estimator)**: Verified configured pricing calculation, explicit `UNKNOWN` handling for unlisted models (`estimatedCostUsd: null`), budget remaining calculation, and live `POST /api/v1/billing/estimate`.
- **Journey E (FFmpeg Signal QA)**: Verified valid H.264/AAC pass, wrong dimensions fail, required vs optional missing audio (`FAILED` vs `NOT_APPLICABLE`), black-frame detection (`blackdetect`), silence ratio (`silencedetect`), and loudness/clipping (`ebur128`) in `signal-qa.test.ts`.
- **Journey F (Regression)**: All existing Phase 1–12 API, worker, database, shared, remotion-engine, and web tests passed (`0` regressions).
