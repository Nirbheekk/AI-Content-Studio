#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${1:-./docker/nginx/certs}"
mkdir -p "${CERT_DIR}"

if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
  echo "[tls] Certificates already exist in ${CERT_DIR}"
  exit 0
fi

echo "[tls] Generating self-signed TLS certificate in ${CERT_DIR} for local/staging HTTPS verification..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -subj "/C=US/ST=California/L=SanFrancisco/O=AIContentOS/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "${CERT_DIR}/privkey.pem"
chmod 644 "${CERT_DIR}/fullchain.pem"
echo "[tls] Generated ${CERT_DIR}/fullchain.pem and ${CERT_DIR}/privkey.pem"
