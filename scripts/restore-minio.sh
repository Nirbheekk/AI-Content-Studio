#!/usr/bin/env bash
set -euo pipefail

# MinIO Object Storage Restore Script
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-minio-backup.tar.gz> [--confirm]" >&2
  exit 1
fi

ARCHIVE="$1"
CONFIRM="${2:-}"
MINIO_CONTAINER="${MINIO_CONTAINER:-aicos-minio}"

if [ ! -f "${ARCHIVE}" ]; then
  echo "[restore-minio] ERROR: Archive not found: ${ARCHIVE}" >&2
  exit 1
fi

if [ -f "${ARCHIVE}.sha256" ]; then
  sha256sum -c "${ARCHIVE}.sha256"
fi

if [ "${CONFIRM}" != "--confirm" ]; then
  echo "[restore-minio] ABORTED: Pass --confirm to restore into ${MINIO_CONTAINER}." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
tar -xzf "${ARCHIVE}" -C "${TMP_DIR}"
EXTRACTED_ROOT="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

for bucket_dir in "${EXTRACTED_ROOT}"/*; do
  [ -d "${bucket_dir}" ] || continue
  bucket="$(basename "${bucket_dir}")"
  docker exec "${MINIO_CONTAINER}" mkdir -p "/data/${bucket}"
  docker cp "${bucket_dir}/." "${MINIO_CONTAINER}:/data/${bucket}/"
  echo "[restore-minio] Restored bucket: ${bucket}"
done
echo "[restore-minio] Restore completed successfully."
