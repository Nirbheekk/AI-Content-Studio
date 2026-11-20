# Docker Conventions

1. **Service Isolation**: Each deployable service (`frontend`, `api`, `worker`, `ai-orchestrator`, `media-worker`, `rendering-worker`, `publishing-worker`, `postgres`, `redis`, `minio`, `nginx`) runs in its own container connected via internal bridge networks (`app-network`, `data-network`, `render-sandbox-network`).
2. **Multi-Stage & Non-Root Builds**: All custom Dockerfiles must use multi-stage builds (`base`, `deps`, `builder`, `runner`) and run the runtime process as a non-root user (`node` or dedicated UID `1001`).
3. **Health Checks & Startup Order**: Every service in `docker-compose.yml` and `docker-compose.prod.yml` must define a real `healthcheck` probing actual readiness (`pg_isready`, `redis-cli ping`, `/api/health`). Downstream containers must use `depends_on` with `condition: service_healthy`.
4. **Rendering Sandbox**: `rendering-worker` must run with CPU and memory limits, read-only root filesystem (except designated `/tmp/remotion` scratch volume), dropped Linux capabilities (`cap_drop: [ALL]`), `no-new-privileges:true`, and restricted network egress (access only to internal MinIO/asset proxy).
5. **Volume Safety**: Never configure scripts or Makefile targets to delete persistent data volumes (`postgres_data`, `redis_data`, `minio_data`) automatically without an explicit confirmation flag.
