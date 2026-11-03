#!/usr/bin/env bash
# Generate a self-signed TLS certificate for the given hostname.
# Usage: ./scripts/generate-cert.sh inventory.yourcompany.local
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:-}"
[ -n "$HOST" ] || { echo "Usage: $0 <hostname>" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }

mkdir -p certs
cat > certs/openssl.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
[dn]
CN = ${HOST}
O = PetroChina GPP
[v3_req]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt_names]
DNS.1 = ${HOST}
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -days 1095 \
  -config certs/openssl.cnf

chmod 600 certs/server.key
echo "Certificate written to certs/server.crt (valid 3 years) for ${HOST}"
echo "To avoid browser warnings, import certs/server.crt into the company trust store."
