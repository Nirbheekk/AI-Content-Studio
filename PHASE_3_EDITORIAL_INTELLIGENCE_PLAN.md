# Stage 3 — Editorial Intelligence, Semantic Media Search & Story Planning Plan

**Date**: 2026-11-22  
**Starting Checkpoint**: `54e20845ea0ce4feb3c5d853702f1fe4212d7121`

## 1. Existing Assets Reused (No Duplication)
- `Transcript` & `AssetScene` Prisma models (`packages/database/prisma/schema.prisma`)
- `analyzeAssetInWorkspace` (`apps/api/src/services/production-pipeline.ts`)
- `MediaRightsRecord` & `evaluateSingleAssetRights` (Stage 2)
- `estimateWorkflowPreflightCost` (Stage 2)
- `MediaVideoPlayer` & `GET /api/v1/assets/:assetId/stream` (Phase 12)

## 2. Additive Scope (Batches 1–7)
1. **Batch 1**: Additive Prisma schema (`Transcript.correctedText`, `EditorialPlan`, `EditorialConcept`) + shared Zod contracts (`packages/shared/src/stage3.ts`).
2. **Batch 2–3**: Hybrid Semantic Media Search (`POST /api/v1/editorial/search`) combining transcript keywords, corrected transcript preservation (`PUT /api/v1/assets/:assetId/transcript`), visual `AssetScene` descriptions, n-gram cosine similarity, and metadata/duration/project filters with strict workspace isolation.
3. **Batch 4**: Evidence-backed Highlight & Hook Discovery (`POST /api/v1/editorial/highlights`) preserving full sentence context (`contextBefore`/`contextAfter`) and deduplicating overlapping windows.
4. **Batch 5**: Autonomous 3-Concept Story Planner & 11-Dimension Anti-Slop Rubric (`POST /api/v1/editorial/plans`, `GET /api/v1/editorial/plans`, `PATCH /api/v1/editorial/plans/:planId/concepts/:conceptId`) with explicit `DIRECT_QUOTE` vs `PARAPHRASE` vs `AI_NARRATION` provenance and human approval/rejection persistence.
5. **Batch 6**: Frontend integration in `/library` (`SemanticSearchPanel`) and `/studio` (`EditorialPlannerPanel`).
6. **Batch 7**: Integration tests (`stage3-editorial.test.ts`), full `typecheck`/`lint`/`test`/`build` gates, acceptance reports, and Git checkpoint.
