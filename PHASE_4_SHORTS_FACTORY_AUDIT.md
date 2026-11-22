# Stage 4 — Professional Shorts Factory Repository Audit

**Date**: 2026-11-22  
**Baseline**: Commit `ce8e3d6` (`main`)

| Capability | Status | Evidence in Current Codebase | Stage 4 Action |
|---|---|---|---|
| **CompositionSpec & Compiler** | **IMPLEMENTED** | `packages/shared/src/composition.ts`, `packages/remotion-engine/src/compiler.ts` | Reuse directly; map Shorts Factory outputs into validated `CompositionSpec`. |
| **FFmpeg/Brag Rendering & FFprobe/Signal QA** | **IMPLEMENTED** | `packages/remotion-engine/src/{brag-engine,video-probe,signal-qa}.ts`, `apps/api/src/services/production-pipeline.ts` | Reuse `renderAndInspectCompositionVersion` so every Short gets verified MP4 + MinIO `headObject` + auto-registered `Asset` + `signalQa`. |
| **YouTube Viral Split-Screen Clipper** | **IMPLEMENTED** | `apps/api/src/services/youtube-viral-clipper.ts`, `POST /api/v1/repurpose/youtube-clip` | Extend with uploaded long-form video batch Shorts generation instead of duplicating. |
| **Editorial Highlight Discovery & Plans** | **IMPLEMENTED** | `apps/api/src/services/editorial-intelligence.service.ts` (Stage 3) | Reuse `discoverAssetHighlights` as candidate source for Batch Shorts Factory. |
| **Media Rights & Cost Estimator** | **IMPLEMENTED** | `apps/api/src/services/{media-rights,cost-estimator}.service.ts` (Stage 2) | Wire pre-flight cost & rights checks into Shorts batch generation. |
| **Transcript-Driven Smart Cutting** | **MISSING** | No silence/filler/retake proposal engine or before/after cutlist | Build `packages/remotion-engine/src/smart-cutter.ts` + `POST /api/v1/shorts/smart-cuts`. |
| **8 Animated Caption Presets** | **PARTIAL** | Single ASS karaoke style in `brag-engine.ts` / `youtube-viral-clipper.ts` | Build 8 structured presets (`CAPTION_PRESETS`) + `caption-engine.ts` (ASS/SRT/VTT). |
| **Motion Presets & Reframing** | **PARTIAL** | Basic layouts & `SPLIT_WEBCAM_BOTTOM` exist; no unified 5-preset motion system or manual focal point | Add 5 `MOTION_PRESETS` + focal-point reframe contract across `9:16`, `4:5`, `1:1`, `16:9`. |
| **Creative Quality QA (Anti-Generic)** | **MISSING** | Technical `signal-qa.ts` exists; no separate measurable Creative QA evaluator | Build `packages/remotion-engine/src/creative-qa.ts` strictly separate from FFmpeg QA. |
| **Batch Shorts Generation UI** | **MISSING** | `/repurpose` only triggers template wave or YouTube URL modal | Add `ShortsFactoryPanel` in `/repurpose` + `CaptionPresetBar` in `/editor`. |
