#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "This helper only runs on macOS." >&2
  exit 1
fi

if [[ -z "${APPLE_CERTIFICATE:-}" || -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD are required." >&2
  exit 1
fi

RUNNER_TEMP_DIR="${RUNNER_TEMP:-$(mktemp -d)}"
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-readani-build-keychain}"
KEYCHAIN_PATH="${KEYCHAIN_PATH:-$RUNNER_TEMP_DIR/readani-build.keychain-db}"
CERT_PATH="$RUNNER_TEMP_DIR/readani-signing-cert.p12"

# Decode robustly even if the GitHub secret contains wrapped lines or CRLF.
printf '%s' "$APPLE_CERTIFICATE" | tr -d '\r\n\t ' | openssl base64 -d -A -out "$CERT_PATH"

# Fail early with a clearer message if the exported certificate or password is wrong.
openssl pkcs12 -in "$CERT_PATH" -nokeys -passin env:APPLE_CERTIFICATE_PASSWORD >/dev/null

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

security import "$CERT_PATH" \
  -k "$KEYCHAIN_PATH" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/productbuild \
  -T /usr/bin/security \
  -T /usr/bin/xcrun

security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')
security default-keychain -s "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  if ! security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -Fq "$APPLE_SIGNING_IDENTITY"; then
    echo "Imported keychain does not contain: $APPLE_SIGNING_IDENTITY" >&2
    security find-identity -v -p codesigning "$KEYCHAIN_PATH" >&2 || true
    exit 1
  fi
fi

echo "Imported Apple signing certificate into $KEYCHAIN_PATH"
