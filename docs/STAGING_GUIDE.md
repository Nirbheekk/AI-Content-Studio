# Controlled Staging Deployment Guide (`docs/STAGING_GUIDE.md`)

## 1. Staging Server Baseline (Approved Tier)
- **Compute**: 4 vCPU, 8 GB RAM, 80+ GB NVMe SSD (+ 2 GB swap recommended on host)
- **Storage**: Local MinIO (backed by NVMe) or external S3-compatible bucket
- **Render Concurrency**: 1 concurrent Remotion render (`rendering-worker` capped at 2.0 vCPU / 2 GB RAM / 512 MB `/dev/shm`)
- **Security**: All production security controls preserved (`docker-compose.prod.yml` + `docker-compose.staging.yml`).

## 2. Host Hardening Checklist (Before First Deploy)
1. **SSH Keys Only**: Disable password authentication (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).
2. **Firewall (`ufw`)**: Allow ONLY ports `22/tcp` (SSH, ideally restricted to admin IP), `80/tcp`, and `443/tcp`. PostgreSQL (`5432`), Redis (`6379`), MinIO (`9000/9001`), and worker ports remain strictly internal to Docker networks.
3. **TLS Certificates**: Place Let's Encrypt or private staging certificates in `docker/nginx/certs/` (`fullchain.pem`, `privkey.pem`) or run `./scripts/generate-self-signed-tls.sh` for private IP testing.
4. **Secrets**: Copy `.env.staging.example` to `.env.staging` and generate unique keys (`openssl rand -hex 32` and `openssl rand -base64 48`).

## 3. Deploy & Validate
```bash
./scripts/deploy-staging.sh
```
Then execute the 14-step end-to-end staging validation (register -> login -> workspace -> Brand Kit -> upload -> script -> compose -> MP4 render -> inspect audio/video/captions -> QA -> approve -> safe test social connect -> non-public publish test -> analytics/usage -> backup & restore).
