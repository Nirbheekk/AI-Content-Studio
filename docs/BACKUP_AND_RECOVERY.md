# Backup & Recovery Guide (`docs/BACKUP_AND_RECOVERY.md`)

## 1. PostgreSQL Backups
- **Script**: `scripts/backup-postgres.sh`
- **Format**: Custom compressed pg_dump (`.dump`) + `.sha256` integrity checksum.
- **Retention**: 14 days default (`RETENTION_DAYS=14`).
- **Cron Schedule (Daily 02:00 UTC)**:
  ```cron
  0 2 * * * cd /opt/ai-content-studio && ./scripts/backup-postgres.sh >> /var/log/aicos-pg-backup.log 2>&1
  ```

## 2. PostgreSQL Restoration
- **Script**: `scripts/restore-postgres.sh <path-to-backup.dump> --confirm`
- Verifies `.sha256` checksum before restoring.
- Requires explicit `--confirm` flag to prevent accidental overwrites.

## 3. MinIO Object Storage Backups
- **Script**: `scripts/backup-minio.sh` (archives `aicos-raw-assets`, `aicos-derivatives`, `aicos-renders` + `.sha256`).
- **Restore**: `scripts/restore-minio.sh <path-to-archive.tar.gz> --confirm`.

## 4. Redis Persistence
- Configured with AOF (`--appendonly yes --appendfsync everysec`) and `--maxmemory-policy noeviction` so queued BullMQ jobs survive container restarts.
