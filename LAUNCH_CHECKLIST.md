# Controlled Staging Launch Checklist (`LAUNCH_CHECKLIST.md`)

- [x] **Code & Security Baseline**: `pnpm audit` = 0 vulnerabilities; Trivy `CRITICAL,HIGH` = 0 across all 4 images.
- [x] **Automated Tests & Quality**: `typecheck` (13/13), `lint` (0 warnings), `build` (8/8), full Vitest integration suite passing.
- [x] **Real Video Rendering**: FFmpeg H.264/AAC + FFprobe verified across `9:16`, `16:9`, `1:1`, `4:5` inside `aicos-rendering-worker`.
- [x] **Responsive UI/UX**: Verified Desktop (`1280x800`), Tablet (`768x1024`), Mobile (`390x844`) with 0 horizontal overflow and 0 console errors.
- [x] **Staging Config Prepared**: `docker-compose.staging.yml`, `.env.staging.example`, `scripts/deploy-staging.sh`, `docs/STAGING_GUIDE.md`.
- [ ] **User Action Required**: Approve Phase 8 hosting provider & payment method.
- [ ] **Provisioning Steps (Post-Approval)**: Provision 4 vCPU / 8 GB RAM VM, configure SSH keys + `ufw` (22/80/443 only), set `.env.staging` secrets + optional live AI/Postiz keys, configure TLS certs, run `./scripts/deploy-staging.sh`, and schedule `scripts/backup-postgres.sh`.
