#!/usr/bin/env bash
set -euo pipefail

# MinIO Object Storage Backup Script
BACKUP_DIR="${BACKUP_DIR:-./backups/minio}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${BACKUP_DIR}/${TIMESTAMP}"
MINIO_CONTAINER="${MINIO_CONTAINER:-aicos-minio}"
BUCKETS="${MINIO_BUCKETS:-aicos-raw-assets aicos-derivatives aicos-renders}"

mkdir -p "${TARGET_DIR}"

echo "[backup-minio] Backing up buckets from ${MINIO_CONTAINER} to ${TARGET_DIR}..."
for bucket in ${BUCKETS}; do
  mkdir -p "${TARGET_DIR}/${bucket}"
  docker cp "${MINIO_CONTAINER}:/data/${bucket}/." "${TARGET_DIR}/${bucket}/" 2>/dev/null || echo "[backup-minio] Bucket ${bucket} empty or not created yet, skipping."
done

tar -czf "${TARGET_DIR}.tar.gz" -C "${BACKUP_DIR}" "${TIMESTAMP}"
rm -rf "${TARGET_DIR}"
sha256sum "${TARGET_DIR}.tar.gz" > "${TARGET_DIR}.tar.gz.sha256"
echo "[backup-minio] Archive created: ${TARGET_DIR}.tar.gz"
