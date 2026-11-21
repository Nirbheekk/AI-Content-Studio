#!/usr/bin/env bash
set -euo pipefail

# Production Deployment Script (Safe, Non-Destructive, Migration-First)
ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy-prod] ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

echo "[deploy-prod] Validating Docker Compose configuration..."
docker compose --env-file "${ENV_FILE}" -f docker-compose.yml -f docker-compose.prod.yml config --quiet

echo "[deploy-prod] Starting core data services (postgres, redis, minio)..."
docker compose --env-file "${ENV_FILE}" -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis minio

echo "[deploy-prod] Waiting for PostgreSQL readiness..."
until docker exec aicos-postgres pg_isready -U "${POSTGRES_USER:-aicos}" -d "${POSTGRES_DB:-ai_content_os}" >/dev/null 2>&1; do
  sleep 2
done

echo "[deploy-prod] Applying Prisma migrations..."
pnpm --env-file="${ENV_FILE}" --filter @ai-content-os/database db:deploy

echo "[deploy-prod] Starting application & worker services..."
docker compose --env-file "${ENV_FILE}" -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "[deploy-prod] Verifying API readiness..."
sleep 5
docker compose --env-file "${ENV_FILE}" -f docker-compose.yml -f docker-compose.prod.yml ps
echo "[deploy-prod] Deployment complete."
