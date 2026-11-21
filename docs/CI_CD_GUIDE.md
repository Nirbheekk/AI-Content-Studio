# CI/CD Guide (`docs/CI_CD_GUIDE.md`)

## Pipeline Overview (`.github/workflows/ci-cd.yml`)
1. **`verify` job**:
   - Installs locked dependencies (`pnpm install --frozen-lockfile`).
   - Runs `pnpm audit --audit-level=high`.
   - Runs `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`.
   - Applies Prisma migrations and executes full test suite against live PostgreSQL 16 and Redis 7 service containers.
2. **`docker-build-and-scan` job** (runs after `verify` passes):
   - Builds `api`, `frontend`, `worker`, and `rendering-worker` images with Buildx GHA layer cache.
   - Scans every image with Trivy (`CRITICAL` severity fails build).
   - Pushes immutable `sha-<commit>` and `latest` tags to `ghcr.io` on `main`.
3. **`deploy-production` job** (manual gate):
   - Runs only on `main` when `vars.DEPLOY_ENABLED == 'true'` and approved in the GitHub `production` environment.
   - Pulls immutable `sha-<commit>` images, runs `./scripts/deploy-prod.sh`, and verifies `/api/ready`.
