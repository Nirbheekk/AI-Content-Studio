# GSD Persistent State (`STATE.md`)

- **Project**: AI Content Operating System
- **Spec Status**: `FINALIZED` ([SPEC.md](./SPEC.md))
- **Active Phase**: Phase 19 Completed & Verified (YouTube Viral Split-Screen Clipper API + `/repurpose` UI Modal Live)
- **Last Action**: Built and wired the YouTube Viral Split-Screen 9:16 Clipper into the full stack: added Zod contracts (`ExecuteYoutubeViralClipRequestSchema`, `ExecuteYoutubeViralClipResponseSchema`) in `packages/shared/src/phase3.ts`, implemented `apps/api/src/services/youtube-viral-clipper.ts` (`yt-dlp` caption & stream extraction, sliding-window multi-factor viral moment detection & scoring, `SPLIT_WEBCAM_BOTTOM` & `CENTER_CROP_9_16` FFmpeg rendering with ASS `\kf` karaoke & `loudnorm` AAC 192k, MinIO upload, Prisma `Asset` + `AssetDerivative` thumbnail persistence), exposed `POST /api/v1/repurpose/youtube-clip` in `apps/api/src/routes/creative.routes.ts`, installed `python3` + `yt-dlp` in `docker/api.Dockerfile`, built `apps/web/src/components/repurpose/youtube-viral-clipper-dialog.tsx` and wired the modal + Viral Clips results panel into `apps/web/src/app/repurpose/page.tsx` (0 raw colors, 0 arbitrary values), and added unit tests in `apps/api/src/__tests__/youtube-viral-clipper.test.ts` (3/3 passed).
- **Empirical Verification**:
  - `pnpm.cmd -r run typecheck`: `8/8` workspace projects passed (`0` errors).
  - `docker compose up -d --build api`: Built cleanly and healthy.
  - Live `POST http://localhost:4000/api/v1/workflows/produce`: `renderStatus: COMPLETED`, `outputSizeBytes: 670552`, `downloadedBytes: 670552`, `contentType: video/mp4`, `qaScore: 100` (replacing previous 512-byte stub).
  - `pnpm audit`: **0 vulnerabilities**.
  - Trivy (`CRITICAL,HIGH --ignore-unfixed`): `0` vulnerabilities, `0` secrets across all 4 images.
  - `docker compose ps`: `11/11` containers `healthy`; `rendering-worker` verified `uid=1000(node)`, read-only rootfs, writable `/tmp/remotion` tmpfs.
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet`: `0` exit code.
  - `pnpm run typecheck` (`13/13`), `pnpm run lint` (`0` warnings/errors), `pnpm run build` (`8/8` packages), and `pnpm run test` (`13/13` tasks, API `28/28` tests passing) verified.
  - Live Browser (`http://localhost:8080`): Verified Light/Dark/System persistence, stationary `100dvh` sidebar, E2E Journeys 1–6, and all 8 responsive viewports (`360x800`, `390x844`, `430x932`, `768x1024`, `1024x768`, `1280x800`, `1440x900`, `1920x1080`) with `0` horizontal overflow and `0` unexpected console/network errors.
- **Next Action**: User review of deployment sizing/cost options before any live public hosting or domain setup.
