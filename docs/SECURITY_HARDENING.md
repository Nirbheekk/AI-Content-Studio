# Security Hardening (`docs/SECURITY_HARDENING.md`)

## 1. Container & Network Isolation
- **No Exposed Internal Ports in Production**: `docker-compose.prod.yml` strips host port bindings (`ports: !override []`) from `postgres`, `redis`, `minio`, `api`, and `frontend`. Only `nginx` exposes `80` and `443`.
- **Rendering Sandbox**: `rendering-worker` runs on `render-sandbox-network` (`internal: true` — zero internet egress), with `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `shm_size: 1gb`, and `/tmp/remotion` tmpfs.
- **Non-Root Execution**: All 4 custom images execute under UID `1000` (`node`).

## 2. TLS & Reverse Proxy Hardening (`docker/nginx/nginx.prod.conf`)
- HTTP (`80`) redirects to HTTPS (`443`) except `/.well-known/acme-challenge/` and `/healthz`.
- TLS 1.2 & TLS 1.3 only, modern AEAD ciphers, `server_tokens off`.
- Security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- Nginx rate limiting: `auth_limit` (`5r/s`, burst 10) and `api_limit` (`30r/s`, burst 50).

## 3. Application & Secret Security
- **Mandatory Prod Secrets**: `docker-compose.prod.yml` rejects startup if `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `S3_SECRET_KEY`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, or `CORS_ALLOWED_ORIGINS` are unset.
- **Credential Encryption**: OAuth tokens and workspace keys are encrypted at rest via AES-256-GCM (`ENCRYPTION_MASTER_KEY`) and redacted in logs (`redactSensitive`).
- **Query Token Restriction**: `?accessToken=` is accepted strictly on `/stream` SSE routes and rejected on all standard REST APIs.
- **Vulnerability Scanning**: `.github/workflows/ci-cd.yml` runs `pnpm audit --audit-level=high` and Trivy container scans (`CRITICAL`) on every build.
