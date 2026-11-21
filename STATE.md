# GSD Persistent State (`STATE.md`)

- **Project**: AI Content Operating System
- **Spec Status**: `FINALIZED` ([SPEC.md](./SPEC.md))
- **Active Phase**: Phase 6 Completed & Verified — Awaiting User Review Before Any Public Hosting/Deployment
- **Last Action**: Implemented Phase 6 Docker Optimization & Production Deployment Readiness:
  - Optimized all 4 multi-stage Dockerfiles (`api.Dockerfile`, `web.Dockerfile`, `worker.Dockerfile`, `rendering-worker.Dockerfile`) with immutable pinned `node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a`, `--frozen-lockfile`, production-only `prod-deps`, and Next.js `output: 'standalone'` (`aicos-frontend` reduced from 1.03 GB to 314 MB; `aicos-api` reduced from 645 MB to 334 MB; `aicos-worker` reduced from 808 MB to 497 MB).
  - Hardened `rendering-worker` (`1.63 GB`) with Chromium `158.0.8127.36`, FFmpeg `8.1.3`, Noto/FreeFont fonts, `read_only: true`, `/tmp/remotion` tmpfs, `cap_drop: [ALL]`, `no-new-privileges:true`, `shm_size: 1gb`, and `internal: true` network isolation.
  - Added `SIGTERM`/`SIGINT` graceful shutdown handlers to `apps/api/src/index.ts` and `apps/workers/src/runtime.ts`.
  - Configured production `docker-compose.prod.yml` and `docker/nginx/nginx.prod.conf` (TLS 1.2/1.3, HTTP->HTTPS redirect, Certbot ACME webroot, SSE zero-buffering location, rate-limit zones, 512M upload limit, security headers, required secret enforcement via `:?`).
  - Added backup/restore scripts (`scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `scripts/backup-minio.sh`, `scripts/restore-minio.sh`, `scripts/generate-self-signed-tls.sh`, `scripts/deploy-prod.sh`) and GitHub Actions CI/CD (`.github/workflows/ci-cd.yml` with Trivy scan & manual production gate).
  - Created 7 operational/deployment docs (`DOCKER_GUIDE.md`, `DEPLOYMENT_GUIDE.md`, `PRODUCTION_RUNBOOK.md`, `BACKUP_AND_RECOVERY.md`, `SECURITY_HARDENING.md`, `ENVIRONMENT_VARIABLES.md`, `CI_CD_GUIDE.md`).
- **Empirical Verification**:
  - All 11 Docker containers built, started, and reached `healthy` status (`docker compose ps`).
  - Verified `rendering-worker` non-root UID 1000, Chromium, FFmpeg, read-only rootfs, and `/tmp/remotion` tmpfs.
  - Verified Nginx proxy routing (`/healthz`, `/api/health`, `/api/ready` with security headers).
  - Tested live `pg_dump` -> `pg_restore` (30 public tables restored) and MinIO bucket archive/restore with SHA-256 checksums.
  - `pnpm run typecheck` (`13/13`), `pnpm run lint` (`0` warnings/errors), and `pnpm run test` (**15 test files / 47 tests**) passed.
- **Next Action**: User review of deployment sizing/cost options before any live public hosting or domain setup.
