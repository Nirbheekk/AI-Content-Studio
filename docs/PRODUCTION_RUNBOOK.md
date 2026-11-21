# Production Runbook (`docs/PRODUCTION_RUNBOOK.md`)

## 1. Health & Readiness Checks
- **Nginx**: `GET /healthz` -> `200 {"status":"healthy"}`
- **API Liveness**: `GET /api/health` -> checks `postgres`, `redis`, `minio`
- **API Readiness**: `GET /api/ready` -> verifies live PostgreSQL query execution
- **Admin Metrics**: `GET /api/v1/admin/metrics` (`OWNER` role) -> BullMQ queue depths, route latencies, error rates, alerts
- **Worker Health**: Ports `4010` (`worker`), `4011` (`ai-orchestrator`), `4012` (`media-worker`), `4013` (`rendering-worker`), `4014` (`publishing-worker`) internal `/health`

## 2. Common Operational Procedures
- **Scale Workers**:
  ```bash
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --scale rendering-worker=3 --scale worker=2
  ```
- **Graceful Restart (Zero Dropped Jobs)**:
  `stop_grace_period: 30s` gives BullMQ workers and Fastify time to drain active requests/jobs on `SIGTERM`:
  ```bash
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml restart api worker rendering-worker
  ```
- **Certbot Renewal**:
  ```bash
  certbot renew --webroot -w /var/www/certbot --deploy-hook "docker exec aicos-nginx nginx -s reload"
  ```
