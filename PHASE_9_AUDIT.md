# Phase 9 — Full System Audit (`PHASE_9_AUDIT.md`)

**Date:** 2026-11-21  
**Baseline Commit:** `bd7a719` (branch `main`)  
**Scope:** Full codebase, AI providers, Remotion rendering, workers, API routes, frontend UI/UX, security, multi-tenancy, and Docker/staging configs.

---

## Summary of Findings

| ID | Severity | Area | Summary |
|---|---|---|---|
| `P0-1` | **P0** | Security / Reliability | Unbounded `SlidingWindowRateLimiter` Map memory leak + missing Fastify `trustProxy: true` behind Nginx |
| `P0-2` | **P0** | Quotas / Billing | `STORAGE_BYTES` quota not enforced on `POST /api/v1/assets/upload-url`; concurrent quota check race window |
| `P1-1` | **P1** | Media Rendering | `synthesizeMp4Artifact` produces non-playable 200-byte JSON/PNG stub instead of real H.264/AAC MP4 |
| `P1-2` | **P1** | Workers / Rendering | `rendering-worker` has no `composition.render` processor; rendering runs inline inside `apps/api` |
| `P1-3` | **P1** | Storage / Proxy | MinIO presigned URLs 404 behind Nginx in prod/staging (`nginx.prod.conf` lacks S3 bucket proxy route) |
| `P1-4` | **P1** | Frontend UX | `/studio`, `/editor`, and `/repurpose` lack `<video controls>` player for rendered MP4s |
| `P2-1` | **P2** | Media Inspection | `/compositions/:id/media-inspection` inspects synthetic stub instead of actual rendered MinIO MP4 |
| `P2-2` | **P2** | Publishing Worker | `apps/workers/src/runtime.ts` `publish.execute` bypasses `PostizPublishingAdapter` (`KI-010`) |
| `P2-3` | **P2** | Real-Time SSE | `workflowEventBus` is process-local `EventEmitter`; separate worker containers cannot push SSE events to API |
| `P2-4` | **P2** | Storage Lifecycle | `DELETE /assets/:id` does not delete `AssetDerivative` objects from MinIO |
| `P3-1` | **P3** | Frontend UX | `/studio` defaults `simulateDefectsOnce` to `true`, injecting artificial QA defects on every first run |
| `P3-2` | **P3** | UI Polish | Mobile/tablet responsiveness and video/audio preview controls across `/studio`, `/editor`, `/repurpose` |

---

## Detailed Findings

### P0-1: Unbounded Rate-Limiter Memory Growth & Missing `trustProxy`
- **Location:** `apps/api/src/lib/jwt.ts` (`SlidingWindowRateLimiter`), `apps/api/src/server.ts:78`
- **Problem:** `SlidingWindowRateLimiter.hits` stores `Map<string, number[]>` indefinitely without pruning expired IP entries. Additionally, Fastify is initialized without `trustProxy: true`, so behind Nginx all clients resolve to Nginx's internal IP and share one rate-limit bucket.
- **Reproduction:** Send requests from distinct `X-Forwarded-For` IPs behind Nginx; `request.ip` remains `127.0.0.1`/bridge IP, and `hits.size` grows monotonically.
- **Expected:** Per-client IP rate limiting behind Nginx and bounded memory via periodic/max-entry pruning of expired timestamps.
- **Actual:** Shared bucket across all proxied users and unbounded `Map` growth.
- **Recommended Fix:** Enable `trustProxy: true` in `buildApiServer()`, prune empty/expired keys in `SlidingWindowRateLimiter.enforce()`, and cap map size with oldest-key eviction.
- **Verification:** Unit + integration tests verifying `X-Forwarded-For` isolation and expired-key cleanup.

### P0-2: Missing `STORAGE_BYTES` Quota Enforcement on Upload
- **Location:** `apps/api/src/routes/assets.routes.ts:24-97`
- **Problem:** `POST /api/v1/assets/upload-url` does not check `assertQuotaAvailable(ctx.workspaceId, 'STORAGE_BYTES')` or whether `used + sizeBytes > limit`.
- **Reproduction:** Exhaust `monthlyStorageBytesQuota` and request a new upload URL.
- **Expected:** HTTP `403 Forbidden` (`FORBIDDEN`) when storage quota is exceeded or would be exceeded.
- **Actual:** Returns `201 Created` with a presigned upload URL.
- **Recommended Fix:** Enforce `assertQuotaAvailable(ctx.workspaceId, 'STORAGE_BYTES')` and check projected `used + sizeBytes` on `/assets/upload-url` and `/assets/:assetId/complete`.
- **Verification:** Integration test asserting `403` when storage quota is exceeded, plus concurrent quota enforcement test.

### P1-1: Non-Playable Synthetic MP4 Stub in `synthesizeMp4Artifact`
- **Location:** `packages/remotion-engine/src/compiler.ts:287-324`, `apps/api/src/services/production-pipeline.ts:366`
- **Problem:** `synthesizeMp4Artifact` builds a tiny `ftyp` + raw JSON `moov` + single PNG `mdat` buffer. It has no H.264 video track (`avc1`/`stbl`) or AAC audio track (`mp4a`).
- **Reproduction:** Download a rendered MP4 from MinIO and run `ffprobe output.mp4` or open in Chrome/VLC.
- **Expected:** Genuine playable MP4 (`H.264` + `AAC`, `mov_text`/burned captions, exact width/height/fps/duration) decodable by `ffprobe` and HTML5 `<video>`.
- **Actual:** `ffprobe` fails (`moov atom not found` / invalid track metadata) and browsers cannot play it.
- **Recommended Fix:** Implement real FFmpeg MP4 rendering (via `rendering-worker` container or FFmpeg binary when available, with a real H.264/AAC multi-scene + audio + text/caption filtergraph pipeline) and validate output with `ffprobe`. Keep deterministic fallback ONLY when FFmpeg is explicitly unavailable in isolated unit tests, clearly flagged `isPlayableMp4: false`.
- **Verification:** Render `9:16`, `16:9`, `1:1`, and `4:5` compositions inside `aicos-rendering-worker`, inspect with `ffprobe -v error -show_format -show_streams`, and verify video + audio streams decode cleanly.

### P1-2: `rendering-worker` Has No `composition.render` Processor
- **Location:** `apps/workers/src/runtime.ts:35-167`, `apps/api/src/services/production-pipeline.ts:303-447`
- **Problem:** `apps/workers/src/runtime.ts` ignores `role === 'rendering'`; `apps/api` performs rendering inline.
- **Reproduction:** Enqueue a job on `QUEUE_NAMES.rendering` (`composition-render`); `aicos-rendering-worker` acknowledges it as a no-op.
- **Expected:** `rendering-worker` executes real FFmpeg/Remotion rendering in its isolated sandbox (`read_only: true`, `/tmp/remotion`), uploads MP4 + QA PNGs to MinIO, updates `RenderJob`, and cleans up `/tmp/remotion`.
- **Actual:** No-op in worker; inline stub in API.
- **Recommended Fix:** Extract shared FFmpeg/Remotion rendering executor into `@ai-content-os/remotion-engine` / `@ai-content-os/workers`, wire `composition.render` in `apps/workers/src/runtime.ts`, and support async/worker-backed rendering with `/tmp/remotion` cleanup in `finally`.
- **Verification:** End-to-end test + live Docker `aicos-rendering-worker` job execution creating a real `ffprobe`-verified MP4 in MinIO.

### P1-3: MinIO Presigned URLs 404 Behind Nginx in Production/Staging
- **Location:** `docker/nginx/nginx.prod.conf`, `docker/nginx/nginx.conf`, `docker-compose.prod.yml`
- **Problem:** When `S3_PUBLIC_ENDPOINT` is set to the public Nginx origin (e.g. `https://staging.example.com`), Nginx forwards `/aicos-renders/...` to `frontend_upstream` (Next.js 404) instead of `minio:9000`.
- **Reproduction:** Request a presigned download URL in staging and `GET` it through Nginx.
- **Expected:** Nginx proxies `/aicos-raw-assets/`, `/aicos-derivatives/`, and `/aicos-renders/` to `minio:9000` preserving `Host: $http_host` so AWS4 signatures verify.
- **Actual:** `404 Not Found` from Next.js.
- **Recommended Fix:** Add `location ~ ^/(aicos-raw-assets|aicos-derivatives|aicos-renders)/` upstream proxy to `minio:9000` in `nginx.prod.conf` and `nginx.conf`.
- **Verification:** `curl` presigned MinIO URL through `http://localhost:8080/aicos-renders/...` via Nginx.

### P1-4: Missing HTML5 `<video>` Player in `/studio`, `/editor`, and `/repurpose`
- **Location:** `apps/web/src/app/studio/page.tsx`, `apps/web/src/app/editor/page.tsx`, `apps/web/src/app/repurpose/page.tsx`
- **Problem:** UI only shows a download link after rendering; users cannot play/scrub the rendered MP4 in-browser.
- **Expected:** `<video controls playsInline src={downloadUrl} />` embedded in Studio, Editor, and Repurpose views.
- **Actual:** No `<video>` element exists.
- **Recommended Fix:** Add responsive `<video controls playsInline>` player with poster/aspect-ratio framing and fallback error notice.
- **Verification:** Next.js production build + UI inspection.

### P2-1: `/media-inspection` Inspects Synthetic Stub Instead of Persisted `RenderJob`
- **Location:** `apps/api/src/routes/creative.routes.ts:500-503`
- **Problem:** `GET /api/v1/compositions/:compositionId/media-inspection` generates `synthesizeMp4Artifact(compiled)` in memory instead of reading the latest `COMPLETED` `RenderJob` MP4 from MinIO when available.
- **Recommended Fix:** Fetch latest `RenderJob` for `currentVersion.id`; if `outputStorageKey` exists in MinIO, inspect its real bytes (and return `ffprobe`/MP4 box metrics); otherwise fall back cleanly.

### P2-2: Publishing Worker Bypassed `PostizPublishingAdapter` (`KI-010`)
- **Location:** `apps/workers/src/runtime.ts:71-160`
- **Problem:** `publish.execute` in worker hardcodes sandbox confirmation and never invokes `PostizPublishingAdapter` when live credentials exist.
- **Recommended Fix:** Route worker `publish.execute` through `PostizPublishingAdapter` from `@ai-content-os/integrations` (preserving `[SIMULATED]` fallback when `POSTIZ_API_KEY` is absent, and preserving rate-limit/transient retry scheduling).

### P2-3: Process-Local `workflowEventBus` SSE Events
- **Location:** `apps/api/src/lib/queues.ts`
- **Problem:** `workflowEventBus` uses Node `EventEmitter`, so events emitted from worker containers do not reach API SSE streams.
- **Recommended Fix:** Bridge `workflowEventBus` with Redis Pub/Sub (`ioredis` publisher/subscriber) when `REDIS_URL` is configured, with graceful fallback to local `EventEmitter` when Redis Pub/Sub is unavailable.

### P2-4: `DELETE /assets/:assetId` Leaves Derivatives in MinIO
- **Location:** `apps/api/src/routes/assets.routes.ts:396-430`
- **Problem:** Deletes raw object from `rawBucket`, but `AssetDerivative` objects (thumbnails, waveforms) remain orphaned in `derivativesBucket`.
- **Recommended Fix:** Query `asset.derivatives`, delete each derivative object from `storage` (`best-effort` on missing keys), then delete `Asset` record.

### P3-1: `/studio` Defaults `simulateDefectsOnce` to `true`
- **Location:** `apps/web/src/app/studio/page.tsx:77`
- **Problem:** Injects fake QA defects by default on every workflow run.
- **Recommended Fix:** Default `simulateDefectsOnce` to `false`.

### P3-2: UI/UX Polish Across Studio, Editor, Repurpose & Responsive Layouts
- **Location:** `apps/web/src/app/*`, `apps/web/src/components/app-shell.tsx`
- **Problem:** Missing in-browser `<video>` playback, occasional missing empty-state guidance and mobile overflow on timeline/tables.
- **Recommended Fix:** Add `<video controls>` players, improve mobile/tablet overflow classes, and verify zero broken links/dead buttons.
