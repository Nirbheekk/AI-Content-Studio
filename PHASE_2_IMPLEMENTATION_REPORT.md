# Stage 2 Foundation — Implementation Report

**Date**: 2026-11-22  
**Starting Checkpoint**: `ae77978`  
**Scope**: Additive Stage 2 foundation across Prisma, Shared Contracts, Remotion/FFmpeg Signal QA, Fastify API, and Next.js Frontend.

---

## 1. Features Delivered

### Feature A — Bulk Folder Upload (`apps/web/src/components/media/bulk-folder-uploader.tsx`, `apps/web/src/app/library/page.tsx`)
- Supports drag-and-drop, multi-file selection, and nested folder selection (`webkitdirectory` + automatic multi-file fallback).
- Preserves nested relative folder structure (`file.webkitRelativePath` -> sanitized `folderPath` via server `sanitizeFolderPath`).
- Per-file & overall progress bar, Cancel button, Retry Failed button, SHA-256 duplicate reporting, completion summary.
- Uses existing secure `/api/v1/assets/upload-url` -> `/upload` -> `/complete` pipeline with storage quota & magic-byte MIME validation.

### Feature B — Media Rights Management (`packages/database/prisma/schema.prisma`, `packages/shared/src/stage2.ts`, `apps/api/src/services/media-rights.service.ts`, `apps/api/src/routes/assets.routes.ts`, `apps/web/src/components/media/media-rights-panel.tsx`)
- Additive `MediaRightsRecord` model + `MediaRightsStatus` (`UNKNOWN | PENDING_VERIFICATION | VERIFIED | RESTRICTED | EXPIRED | REVOKED`) and `MediaRightsSource` (`USER_OWNED | LICENSED_STOCK | AI_GENERATED | VOICE_CLONED | CLIENT_PROVIDED | UNKNOWN`).
- Centralized `evaluateSingleAssetRights` & `evaluatePublishRightsGate` returning `ALLOWED | ALLOWED_WITH_ATTRIBUTION | REVIEW_REQUIRED | BLOCKED` with explicit reasons & required attribution.
- Enforces verified consent for `VOICE_CLONED`, territory restrictions, platform usage restrictions, commercial-use checks, and expiration dates.
- Exposed `GET /api/v1/assets/:assetId/rights` and `PUT /api/v1/assets/:assetId/rights` (audited in `AuditLog`) and wired `MediaRightsPanel` into Media Library Inspector.

### Feature C — Publishing Rights Gate (`apps/api/src/services/publishing.service.ts`, `apps/api/src/routes/publishing.routes.ts`)
- Wired `assertPublishRightsPermitted` into BOTH `createOrSchedulePublishPost` (schedule-time gate) AND `executePostPublication` (pre-execution re-evaluation catching expiry or revocation after scheduling, unbypassable by retries).
- Exposed `POST /api/v1/publishing/rights-check` for pre-flight UI verification.

### Feature D — Pre-Flight Cost Estimator & Budget Policies (`packages/database/prisma/schema.prisma`, `packages/shared/src/stage2.ts`, `apps/api/src/services/cost-estimator.service.ts`, `apps/api/src/routes/intelligence.routes.ts`, `apps/web/src/components/studio/preflight-cost-banner.tsx`)
- Additive `BudgetPolicy` model (`monthlyLimitUsd`, `perOperationLimitUsd`, `approvalThresholdUsd`, `enforceHardStop`, per-workspace or per-project).
- Versioned `PROVIDER_PRICING_REGISTRY` with explicit `effectiveDate`, `lastVerifiedDate`, and `sourceRef`; unlisted models are explicitly marked `priceStatus: 'UNKNOWN'` and `estimatedCostUsd: null` (never fabricated).
- Exposed `POST /api/v1/billing/estimate`, `GET /api/v1/billing/budget-policy`, and `PUT /api/v1/billing/budget-policy` (RBAC `ADMIN`).
- Wired `PreflightCostBanner` into AI Studio before `Produce`.

### Feature E — FFmpeg Technical Signal QA (`packages/remotion-engine/src/signal-qa.ts`, `apps/api/src/services/production-pipeline.ts`)
- Profile-aware technical QA using `ffprobe` + `ffmpeg` (`blackdetect`, `silencedetect`, `ebur128` integrated loudness & true peak).
- Returns structured `SignalQaReport` (`PASSED | WARNING | FAILED | NOT_APPLICABLE`) with measured vs expected values, timestamps, and suggested remediation.
- Wired into `renderAndInspectCompositionVersion` and persisted in `Asset.aiMetadataJson.signalQa`.
