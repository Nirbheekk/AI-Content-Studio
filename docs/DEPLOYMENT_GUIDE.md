# Production Deployment Guide (`docs/DEPLOYMENT_GUIDE.md`)

## 1. Infrastructure Sizing & Cost Estimates
A single small VPS is NOT sufficient for concurrent headless Chromium + FFmpeg Remotion rendering.

| Tier | Workload | Recommended Hardware | Est. Monthly Cost |
|---|---|---|---|
| **Staging / Single-Tenant** | <= 5 users, 1 render at a time | 4 vCPU, 8 GB RAM, 80 GB NVMe + S3 | ~\$40 - \$60/mo (Hetzner CPX31 / DigitalOcean) |
| **Production (Single-Node)** | 10-50 active creators, 1-2 concurrent renders | 8 vCPU, 16 GB RAM, 160 GB NVMe + Managed PG/S3 | ~\$90 - \$160/mo |
| **Production (Split Render Cluster)** | 50+ creators, >= 3 concurrent renders | App/API node (4 vCPU, 8 GB) + Render node (8-16 vCPU, 16-32 GB) + Managed PG/Redis + S3/R2 | ~\$220 - \$450/mo + AI API usage |

## 2. Pre-Deployment Security & Verification Baseline
Before deploying to any host:
- `pnpm audit` must return `0` high/critical vulnerabilities (verified in Phase 7: `0` vulnerabilities total).
- Trivy image scans (`CRITICAL,HIGH --ignore-unfixed`) on `aicos-api`, `aicos-frontend`, `aicos-worker`, and `aicos-rendering-worker` must pass with `0` critical/high findings and `0` leaked secrets.

## 3. Deployment Steps
1. **Provision Server & Docker Engine**: Ubuntu 24.04 LTS with Docker Engine 26+ and Compose v2.
2. **Configure Secrets**: Copy `.env.example` to `.env.production` and generate strong secrets:
   ```bash
   openssl rand -hex 32  # ENCRYPTION_MASTER_KEY
   openssl rand -base64 48  # JWT_SECRET / REDIS_PASSWORD / POSTGRES_PASSWORD
   ```
3. **Provision TLS Certificates**:
   - Production: Use Certbot (`certbot certonly --webroot -w /var/www/certbot -d app.example.com`) and symlink/copy `fullchain.pem` + `privkey.pem` to `./docker/nginx/certs/`.
   - Local/Staging HTTPS check: `./scripts/generate-self-signed-tls.sh`.
4. **Deploy Stack**:
   ```bash
   ./scripts/deploy-prod.sh
   ```
5. **Verify Health**:
   ```bash
   curl -sfk https://127.0.0.1/healthz
   curl -sfk https://127.0.0.1/api/ready
   ```

## 4. Rollback Procedure
1. Identify previous verified image SHA tag (`IMAGE_TAG=sha-<prev>`).
2. Restore pre-migration PostgreSQL backup if schema changed (`./scripts/restore-postgres.sh <dump> --confirm`).
3. Pull and restart services with previous tag:
   ```bash
   IMAGE_TAG=sha-<prev> docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
