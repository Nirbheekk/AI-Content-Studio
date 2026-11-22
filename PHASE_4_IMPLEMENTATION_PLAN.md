# Stage 4 — Professional Shorts Factory Implementation Plan

**Date**: 2026-11-22  
**Starting Checkpoint**: `ce8e3d63934409c4959760610b62882db2aba45d`

1. **Batch 1**: Shared Stage 4 contracts (`packages/shared/src/stage4.ts`) — 8 `CAPTION_PRESETS`, 5 `MOTION_PRESETS`, Smart Cutting schemas, Reframing focal point, Batch Shorts request/response, and 10-point Creative QA schema.
2. **Batch 2–4**: Deterministic engine modules in `packages/remotion-engine/src/`:
   - `smart-cutter.ts` (confidence-aware silence/filler/retake/false-start proposals with dramatic-pause & natural-pause protection).
   - `caption-engine.ts` (all 8 caption presets -> ASS `\kf` karaoke / word-pop + punctuation-aware line wrap + SRT/VTT export).
   - `creative-qa.ts` (measurable creative QA separated from FFmpeg technical Signal QA).
3. **Batch 5 & 7**: `apps/api/src/services/shorts-factory.service.ts` + `apps/api/src/routes/shorts.routes.ts` (`GET /api/v1/shorts/presets`, `POST /api/v1/shorts/smart-cuts`, `POST /api/v1/shorts/captions/preview`, `POST /api/v1/shorts/batch`).
4. **Batch 6**: Frontend integration — `ShortsFactoryPanel` in `/repurpose` and `CaptionPresetBar` in `/editor`.
5. **Batch 8**: Unit & integration tests (`stage4-shorts-engine.test.ts`, `stage4-shorts-factory.test.ts`), full `typecheck`/`lint`/`test`/`build` gates, acceptance reports, and Git checkpoint.
