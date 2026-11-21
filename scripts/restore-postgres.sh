#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL Verified Restore Script
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-backup.dump> [--confirm]" >&2
  exit 1
fi

BACKUP_FILE="$1"
CONFIRM="${2:-}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-aicos-postgres}"
POSTGRES_USER="${POSTGRES_USER:-aicos}"
POSTGRES_DB="${POSTGRES_DB:-ai_content_os}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[restore-postgres] ERROR: File not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "[restore-postgres] Verifying SHA-256 checksum..."
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

if [ "${CONFIRM}" != "--confirm" ]; then
  echo "[restore-postgres] ABORTED: Pass --confirm as second argument to overwrite database ${POSTGRES_DB}." >&2
  exit 1
fi

echo "[restore-postgres] Restoring ${BACKUP_FILE} into ${POSTGRES_DB}..."
docker exec -i "${POSTGRES_CONTAINER}" pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner --no-acl < "${BACKUP_FILE}"
echo "[restore-postgres] Restore completed successfully."
