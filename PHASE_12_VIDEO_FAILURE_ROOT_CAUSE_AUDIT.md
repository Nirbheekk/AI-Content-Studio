# Phase 12 — AI Studio Video Playback Failure Root-Cause Audit

**Date**: 2026-11-22  
**Symptom Source**: Live AI Studio screenshot showing `Final MP4` (`Unavailable`, `651.7 KB`, `Playback failed — Video unavailable, access expired, or format not supported by this browser.`), `0 media assets` in Project Context, `Simulated` badge in Live Preview header, and active `Refine in Editor / Repurpose / Publish` actions despite playback failure.

---

## 1. Forensic Root Causes (Exact File & Line Evidence)

### Issue A — Final MP4 `Unavailable` / `Playback failed` on `651.7 KB`
1. **Unresolved Relative Stream URL (`apps/web/src/components/video/media-video-player.tsx`, `apps/web/src/lib/api-client.ts:173`)**:
   - `GET /api/v1/compositions/:id` returns `streamUrl: "/api/v1/renders/:id/stream?token=..."`.
   - Unlike `apiRequest()` and `EventSource` (which prefix `${getApiBaseUrl()}`), `MediaVideoPlayer` passed the bare relative `/api/v1/...` string directly to `<video src>`. On direct Next.js origins (`:3000`) or mismatched ports, `<video>` hit Next.js (`404`) instead of the Fastify API/Nginx origin (`getApiBaseUrl()`).
2. **Stale Version Selection (`apps/web/src/app/studio/page.tsx:185`)**:
   - `loadStudioState()` selected `detail.versions[0]?.renderJobs[0]`. Because `GET /api/v1/compositions/:id` orders `versions` ascending (`versionNumber: 'asc'`), `versions[0]` is always **Version 1 (oldest)** rather than `activeVersion` or the newest version with a `COMPLETED` render.
3. **No URL Refresh on Retry (`apps/web/src/components/studio/studio-preview-pane.tsx:155`)**:
   - `StudioPreviewPane` did not pass `onRequestRefreshUrl` to `VideoPlayer`, so clicking `Retry Playback` simply reloaded the exact same expired/failed URL.
4. **Generic Error Message (`apps/web/src/components/video/media-video-player.tsx:52-66`)**:
   - `MediaError.code === 4` always displayed a single generic message without probing HTTP status (`401` Expired/Unauthorized, `403` Forbidden, `404` Missing Storage Object, `5xx` Server Error vs `200/206` Unsupported Codec).

### Issue B — `0 media assets` in Project Context While Final MP4 Appears
1. **Cross-Project Leak on Initial Load & Project Switch (`apps/web/src/app/studio/page.tsx:164, 536-539`)**:
   - `loadStudioState()` called `GET /api/v1/compositions` **without `?projectId=`**, loading a composition from another project while `loadProjectAssets(defaultProjId)` loaded `0` assets for the selected project.
   - `onSelectProject` only called `loadProjectAssets(id)` and never reloaded or cleared the right-hand preview for the newly selected project.
2. **Missing Asset List Refresh After Render (`apps/web/src/app/studio/page.tsx:387-401, 430-440`)**:
   - `handleProduce` and `handleRevise` updated `renderJob` in state but never called `loadProjectAssets(targetProjId)` to display the newly auto-registered `/rendered-videos` asset.
3. **Flat Asset Count (`apps/web/src/components/studio/studio-context-rail.tsx:78`)**:
   - Displayed a single undifferentiated `N media assets` label instead of separating `Source Media`, `Generated Videos`, and `Total Assets`.

### Issue C — Contradictory `Simulated` Badge Next to Real `Final MP4`
- **Hardcoded Initial State (`apps/web/src/app/studio/page.tsx:74`)**:
  - `const [isSimulatedMode, setIsSimulatedMode] = useState(true);` stamped every loaded composition with a warning `Simulated` badge in the Live Preview header regardless of whether the MP4 was genuinely rendered via FFmpeg and verified by FFprobe.
- **Fix**: Default `isSimulatedMode` to `false` (only `true` when the AI workflow explicitly reports `isSimulated: true`), label AI simulation explicitly as `AI Brief: Simulated`, and display `Final MP4 Ready` ONLY after the browser `<video>` actually loads verified metadata (`readyState >= 2`).

### Issue D — Approval / Publish Available During Playback Failure
- **Unchecked Downstream Actions (`apps/web/src/components/studio/studio-preview-pane.tsx:143-185`)**:
  - `Approve for Publishing` and `Publish` remained clickable even when `renderJob` had failed or `<video>` entered `error` state.
- **Fix**: Propagate `MediaVideoPlayer` playback phase via `onPhaseChange`, gate `Approve for Publishing` and `Publish` on a verified `COMPLETED` render + non-errored playback (with explicit readiness reason when locked), and keep `Refine in Editor` enabled whenever a valid composition exists.
