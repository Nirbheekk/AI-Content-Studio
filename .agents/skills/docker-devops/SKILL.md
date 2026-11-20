---
name: docker-devops
description: >-
  Use this skill when configuring or troubleshooting Dockerfiles,
  docker-compose.yml, docker-compose.prod.yml, container networks, health
  checks, resource limits, MinIO buckets, or Nginx reverse proxy rules.
---

# Docker and DevOps Skill

## Responsibilities
- Maintain the 11-service Docker Compose architecture (`frontend`, `api`, `postgres`, `redis`, `worker`, `ai-orchestrator`, `media-worker`, `rendering-worker`, `publishing-worker`, `minio`, `nginx`).
- Enforce multi-stage builds, non-root execution, container health checks, and strict sandbox isolation for `rendering-worker`.

## Technical Standards
1. Every container must define a valid `healthcheck` and `restart: unless-stopped`.
2. `rendering-worker` must enforce CPU/memory limits, `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, and restricted network egress.
3. Never delete persistent volumes (`postgres_data`, `redis_data`, `minio_data`) in standard stop/restart scripts.

## Implementation Workflow
1. Validate Compose files with `docker compose config`.
2. Build and start services, then verify actual service readiness via `docker compose ps` and health endpoints.
3. Document environment variables in `.env.example` and commands in `Makefile` and `README.md`.

## Validation Requirements
- `docker compose config` succeeds with zero warnings or errors.
- All running containers achieve `healthy` status and communicate over internal Docker networks.
