# Phase 12 — End-to-End Video Generation, Visualization & Playback Pipeline Audit

**Date**: 2026-11-22  
**Repository**: `C:\Users\user\Desktop\AI -Content-Studio` (`main`)  
**Scope**: Full trace from AI Agent / Manual / Editor / Repurpose / YouTube Clipper video creation through FFmpeg/Remotion rendering, MinIO storage, Fastify/Nginx delivery, and browser HTML5 playback.

---

## 1. Identified Video Generation Pathways

| # | Pathway | Entry Endpoint / UI | Render Engine | Current Persistence | Current Playback UI |
|---|---|---|---|---|---|
| 1 | **AI Agent Autonomous Production** | `POST /api/v1/workflows/produce` (`/studio`) | `executeBragRenderPipeline` (`packages/remotion-engine/src/brag-engine.ts`) | `RenderJob` (`aicos-renders`) only — **NO `Asset` record** | `StudioPreviewPane` -> raw presigned `:9000` URL |
| 2 | **Manual Composition Render** | `POST /api/v1/compositions/:id/render` (`/editor`, `/studio`) | `executeBragRenderPipeline` | `RenderJob` (`aicos-renders`) only — **NO `Asset` record** | `editor/page.tsx` -> ignores `?compositionId=`, raw presigned URL |
| 3 | **Multi-Platform Repurpose Wave** | `POST /api/v1/repurpose` (`/repurpose`) | `executeBragRenderPipeline` | `RenderJob` (`aicos-renders`) only — **NO `Asset` record** | No inline player; only `Edit` / `Publish` links |
| 4 | **YouTube Viral Split-Screen Clipper** | `POST /api/v1/repurpose/youtube-clip` (`/repurpose` modal) | `ffmpeg` split-screen + ASS `\kf` (`apps/api/src/services/youtube-viral-clipper.ts`) | `Asset` (`aicos-raw-assets`) + `AssetDerivative` (`THUMBNAIL`) | External `<a target="_blank">Watch</a>` only; vanishes on reload |
| 5 | **Direct Manual Media Upload** | `POST /api/v1/assets/upload-init` -> `complete` (`/library`) | User-uploaded binary | `Asset` (`aicos-raw-assets`) | **NO `<video>` player in Media Library Inspector Sheet** |

---

## 2. Exact Failure Points & Root Causes

### Root Cause 1 — Rendered Videos Never Register as Project Media Assets (`CRITICAL`)
- **Location**: `apps/api/src/services/production-pipeline.ts` (`renderCompositionVersionAndInspect`, lines 365–418).
- **Problem**: `renderCompositionVersionAndInspect` uploads the MP4 to `aicos-renders` and marks `RenderJob` as `COMPLETED`, but **never creates or links an `Asset` record** in PostgreSQL.
- **Impact**: AI-generated and Editor-rendered videos never appear in `/library` or `/projects`.

### Root Cause 2 — No FFprobe Output Verification or Post-Upload MinIO Confirmation (`CRITICAL`)
- **Location**: `apps/api/src/services/production-pipeline.ts:365-391`, `apps/api/src/services/youtube-viral-clipper.ts:450-505`.
- **Problem**: Neither pipeline inspects the rendered MP4 with `ffprobe` (codec `h264`, pixel format `yuv420p`, valid width/height/duration, `aac` audio when present) nor confirms object existence via `storage.headObject()` before setting `status = 'COMPLETED'`.
- **Impact**: Corrupted, zero-byte, or non-browser-compatible files can be falsely marked `COMPLETED`.

### Root Cause 3 — No Authenticated Same-Origin HTTP Range Streaming Endpoint (`CRITICAL`)
- **Location**: `apps/api/src/routes/assets.routes.ts`, `apps/api/src/routes/production.routes.ts`, `docker-compose.yml` (`S3_PUBLIC_ENDPOINT: http://localhost:9000`).
- **Problem**: All playback URLs are raw cross-origin MinIO presigned URLs (`http://localhost:9000/...`) with 1-hour expiry. There is no authenticated `GET /api/v1/assets/:assetId/stream` or `GET /api/v1/renders/:renderJobId/stream` endpoint supporting HTTP `200`/`206`/`416` byte-range streaming with live workspace RBAC enforcement.
- **Impact**: Direct MinIO URLs expire after 1 hour, fail when MinIO is private/unreachable from the browser, bypass real-time revocation/deletion checks, and break seeking on proxies without proper range forwarding.

### Root Cause 4 — Media Library Has Zero Video Playback Support (`HIGH`)
- **Location**: `apps/web/src/app/library/page.tsx` (lines 521–581).
- **Problem**: The Asset Inspector `<Sheet>` renders metadata, AI summary, transcript, and scenes, but **no `<video>` player and no download button**.
- **Impact**: Users clicking any uploaded, AI-rendered, or YouTube-clipped video in `/library` cannot watch or download it.

### Root Cause 5 — Bare `<video>` Component With No Media Event / Error / Retry Handling (`HIGH`)
- **Location**: `apps/web/src/components/creative/video-player.tsx` (lines 1–48).
- **Problem**: Renders a plain `<video src={src} />` with no handling for `loadstart`, `loadedmetadata`, `canplay`, `waiting`, `playing`, `pause`, `ended`, or `error`, no playback speed control, no poster support, no Retry button, and no expired-URL refresh callback.
- **Impact**: Failed or expired videos appear as broken black boxes with no explanation or recovery path.

### Root Cause 6 — Editor Ignores URL Context & Conflates Preview With Final MP4 (`HIGH`)
- **Location**: `apps/web/src/app/editor/page.tsx` (lines 210–226), `apps/web/src/components/studio/studio-preview-pane.tsx` (lines 112–141).
- **Problem**:
  - `editor/page.tsx` always selects `list[0]` from `/api/v1/compositions`, ignoring `?compositionId=` and `?projectId=`.
  - `StudioPreviewPane` swaps out `RemotionLivePlayer` when an MP4 exists while leaving the Remotion frame scrubber underneath (which does not control the HTML5 `<video>`).
- **Impact**: Users clicking "Edit" from Studio/Repurpose/Projects open the wrong composition, and cannot cleanly switch between Live Remotion Preview and Final Rendered MP4.

### Root Cause 7 — Repurpose & YouTube Clipper Lose Clips on Reload & Lack Inline Playback (`MEDIUM`)
- **Location**: `apps/web/src/app/repurpose/page.tsx`.
- **Problem**: Generated YouTube viral clips are kept only in local component state (`viralResult`) and only offer an external `<a target="_blank">Watch</a>` link. Reloading `/repurpose` hides all previously generated clips.
- **Impact**: Clips cannot be played inline or revisited after a page refresh.

### Root Cause 8 — Projects Page Lacks Playable Video Asset Previews (`MEDIUM`)
- **Location**: `apps/web/src/app/projects/page.tsx`.
- **Problem**: Project cards show numeric counts (`X assets · Y compositions`) with no quick-preview drawer or direct playback of rendered project videos.

---

## 3. Security & Reliability Risks

1. **Private MinIO Exposure**: Relying on browser-direct `:9000` presigned URLs requires exposing MinIO directly instead of keeping storage private behind Fastify RBAC.
2. **Stale/Revoked Access**: Presigned URLs remain valid for 3600s even after an asset is deleted or a user's workspace access is revoked.
3. **Memory Pressure**: Naive proxy streaming that buffers entire MP4s into RAM (`arrayBuffer()`) would OOM on large videos; streaming must pipe Web/Node streams with HTTP `Range` passthrough.
4. **Silent Render Failures**: Without `ffprobe` + `headObject` verification, failed/truncated FFmpeg outputs could be stored and marked `COMPLETED`.

---

## 4. Prioritized Fix Plan (Batches 2–11)

1. **Batch 2 & 3 (FFprobe Verification + Unified Render-to-Asset Lifecycle)**:
   - Add `probeVideoBufferOrFile` (`ffprobe` JSON parser & browser-compatibility validator: `mp4` + `h264` + `yuv420p` + `width/height/duration > 0` + `aac` when audio present) in `packages/remotion-engine/src/video-probe.ts`.
   - Enforce verification + `storage.headObject()` confirmation + automatic `Asset` + `THUMBNAIL` `AssetDerivative` registration inside `renderCompositionVersionAndInspect` (`apps/api/src/services/production-pipeline.ts`) and `youtube-viral-clipper.ts`. Mark `RenderJob` `FAILED` with actionable error if verification fails.
2. **Batch 4 (Authenticated HTTP Range Video Streaming & Download)**:
   - Add `getObjectStream` (forwarding `Range` header -> returning status `200`/`206`/`416`, `content-type`, `content-length`, `content-range`, `accept-ranges`, and readable stream without buffering into RAM) to `MinioStorageAdapter` (`packages/integrations/src/storage.ts`).
   - Add authenticated streaming & download routes with workspace RBAC + tenant isolation + short-lived signed stream token fallback for HTML5 `<video src>`:
     - `GET /api/v1/assets/:assetId/stream` (supports `Authorization: Bearer` or signed media token `?token=...` scoped to `{ workspaceId, assetId, exp }`, enforces live DB existence & workspace ownership, supports `Range` `200`/`206`/`416` + `?download=1`).
     - `GET /api/v1/renders/:renderJobId/stream` (same live RBAC + Range streaming for `RenderJob` outputs).
   - Return canonical same-origin `/api/v1/assets/:id/stream?token=...` and `/api/v1/renders/:id/stream?token=...` playback URLs from API endpoints alongside presigned URLs so browser `<video>` elements work cleanly through Nginx (`http://localhost:8080`) with full seeking & auth!
3. **Batch 5 (Reusable Production Video Player)**:
   - Upgrade `apps/web/src/components/video/media-video-player.tsx` (and re-export from `creative/video-player.tsx` for backward compatibility) with full HTML5 media event lifecycle (`loadstart`, `loadedmetadata`, `loadeddata`, `canplay`, `waiting`, `playing`, `pause`, `ended`, `error`, `timeupdate`), playback speed (`0.75x / 1x / 1.25x / 1.5x / 2x`), poster support, responsive aspect ratio, loading/buffering/error/expired-URL states, Retry + URL refresh callback, and authenticated download.
4. **Batch 6 & 7 (Connect Playback Across All Routes + Reload Persistence)**:
   - **Media Library (`/library`)**: Embed `MediaVideoPlayer` + Thumbnail preview + Authenticated Download inside the Asset Inspector `<Sheet>`.
   - **AI Studio (`/studio`)**: Separate **Final MP4** vs **Live Remotion Composition** sub-mode in `StudioPreviewPane` so users can play/seek the real MP4 AND inspect the Remotion composition independently.
   - **Video Editor (`/editor`)**: Honor `?compositionId=` and `?projectId=` URL params + `activeCompositionId` from `StudioContext`, and display `MediaVideoPlayer` for the latest verified render export.
   - **Repurpose (`/repurpose`)**: Hydrate persisted YouTube viral clip assets from `/api/v1/assets` on page load (survives reload!) and render inline `MediaVideoPlayer` for every generated clip.
   - **Projects (`/projects`)**: Add quick-play video preview drawer for project video assets.
5. **Batch 8–11 (Security, Automated Tests, Responsive Visual QA, Docs & Git Push)**:
   - Backend unit + integration tests (FFprobe validation, HTTP Range `200`/`206`/`416`, cross-workspace denial `403`/`404`, expired token `401`, deleted asset `404`).
   - Frontend Vitest tests for `MediaVideoPlayer` states.
   - Real Playwright E2E browser playback & seeking tests (`readyState >= 2`, `duration > 0`, `currentTime` advances after play & seek, survives `page.reload()`) across desktop & mobile viewports.
   - Deliver `PHASE_12_VIDEO_PLAYBACK_FIX_REPORT.md`, `PHASE_12_VIDEO_E2E_TEST_REPORT.md`, update `STATE.md` & `docs/PROJECT_STATUS.md`, validate all gates, and push cleanly to `origin/main`.
