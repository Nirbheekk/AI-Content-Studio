#!/usr/bin/env bash
set -euo pipefail

# Staging Deployment Script (4 vCPU / 8 GB RAM, Non-Destructive, Migration-First)
ENV_FILE="${ENV_FILE:-.env.staging}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy-staging] ERROR: ${ENV_FILE} not found. Copy .env.staging.example and set real secrets." >&2
  exit 1
fi

echo "[deploy-staging] Validating staging Docker Compose configuration..."
docker compose --env-file "${ENV_FILE}" ${COMPOSE_FILES} config --quiet

echo "[deploy-staging] Starting PostgreSQL, Redis, and MinIO..."
docker compose --env-file "${ENV_FILE}" ${COMPOSE_FILES} up -d postgres redis minio

echo "[deploy-staging] Waiting for PostgreSQL readiness..."
until docker exec aicos-postgres pg_isready -U "${POSTGRES_USER:-aicos_staging}" -d "${POSTGRES_DB:-ai_content_os_staging}" >/dev/null 2>&1; do
  sleep 2
done

echo "[deploy-staging] Applying Prisma migrations..."
pnpm --env-file="${ENV_FILE}" --filter @ai-content-os/database db:deploy

echo "[deploy-staging] Starting application, worker, and Nginx services..."
docker compose --env-file "${ENV_FILE}" ${COMPOSE_FILES} up -d

echo "[deploy-staging] Verifying container status and health endpoints..."
sleep 5
docker compose --env-file "${ENV_FILE}" ${COMPOSE_FILES} ps
curl -sfk https://127.0.0.1/healthz
echo ""
curl -sfk https://127.0.0.1/api/ready
echo ""
echo "[deploy-staging] Staging deployment complete."
