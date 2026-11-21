#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL Automated Backup Script with Retention & Checksum Verification
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-aicos-postgres}"
POSTGRES_USER="${POSTGRES_USER:-aicos}"
POSTGRES_DB="${POSTGRES_DB:-ai_content_os}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[backup-postgres] Starting backup of ${POSTGRES_DB} from ${POSTGRES_CONTAINER}..."
docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc --no-owner --no-acl > "${BACKUP_FILE}"

if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[backup-postgres] ERROR: Backup file is empty: ${BACKUP_FILE}" >&2
  rm -f "${BACKUP_FILE}"
  exit 1
fi

sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
echo "[backup-postgres] Backup created: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Prune backups older than RETENTION_DAYS
find "${BACKUP_DIR}" -type f \( -name "*.dump" -o -name "*.sha256" \) -mtime "+${RETENTION_DAYS}" -delete
echo "[backup-postgres] Retention cleanup complete (kept last ${RETENTION_DAYS} days)."
