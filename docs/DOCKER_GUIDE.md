# Docker Guide (`docs/DOCKER_GUIDE.md`)

## 1. Architecture Overview (11 Services)
AI Content Operating System runs as an isolated 11-service Docker Compose stack across 3 networks:
- `edge-network`: `nginx`, `frontend`, `api`
- `backend-network`: `api`, `worker`, `ai-orchestrator`, `media-worker`, `publishing-worker`, `postgres`, `redis`, `minio`
- `render-sandbox-network` (`internal: true` in production): `rendering-worker`, `postgres`, `redis`, `minio`

## 2. Optimized Multi-Stage Dockerfiles
All custom Dockerfiles pin `node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` and run as non-root `node` user:
- `docker/api.Dockerfile` (`aicos-api:1.0.0`): Builds workspace dependencies (`shared`, `database`, `ai-providers`, `remotion-engine`, `integrations`, `api`) with `--frozen-lockfile`, prunes devDependencies via `prod-deps`. Size: ~334 MB.
- `docker/web.Dockerfile` (`aicos-frontend:1.0.0`): Uses Next.js `output: 'standalone'` to bundle minimal server + static assets. Size: ~314 MB (down from 1.03 GB).
- `docker/worker.Dockerfile` (`aicos-worker:1.0.0`): Shared image for `worker`, `ai-orchestrator`, `media-worker`, and `publishing-worker`, includes `ffmpeg` and production `node_modules`. Size: ~497 MB (down from 808 MB).
- `docker/rendering-worker.Dockerfile` (`aicos-rendering-worker:1.0.0`): Isolated Remotion/Chromium renderer with `chromium`, `nss`, `freetype`, `harfbuzz`, `ttf-freefont`, `font-noto`, `ffmpeg`, `read_only: true`, `/tmp/remotion` tmpfs, `cap_drop: [ALL]`, `no-new-privileges:true`, and `shm_size: 1gb`. Size: ~1.63 GB.

## 3. Common Commands
- Validate production config:
  ```bash
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config --quiet
  ```
- Build all images:
  ```bash
  docker compose build
  ```
- Start development stack:
  ```bash
  docker compose up -d
  ```
- Start production stack & scale workers:
  ```bash
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --scale worker=2 --scale rendering-worker=2
  ```
