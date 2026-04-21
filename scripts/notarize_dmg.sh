#!/usr/bin/env bash
set -euo pipefail

DMG_PATH="${1:-}"
APP_PATH="${2:-}"

if [[ -z "$DMG_PATH" ]]; then
  echo "Usage: $0 <path-to-dmg> [path-to-app]" >&2
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "DMG not found: $DMG_PATH" >&2
  exit 1
fi

submit_with_api_key() {
  xcrun notarytool submit "$DMG_PATH" \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" \
    --wait
}

submit_with_apple_id() {
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
}

if [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  submit_with_api_key
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  submit_with_apple_id
else
  cat >&2 <<'EOF'
Missing notarization credentials.

Set one of:
  1. APPLE_API_KEY_PATH + APPLE_API_KEY + APPLE_API_ISSUER
  2. APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID
EOF
  exit 1
fi

xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

if [[ -n "$APP_PATH" ]]; then
  if [[ ! -d "$APP_PATH" ]]; then
    echo "App bundle not found: $APP_PATH" >&2
    exit 1
  fi

  codesign --verify --deep --strict --verbose=2 "$APP_PATH"
  spctl --assess --type execute -vv "$APP_PATH"
fi

echo "Notarized and stapled: $DMG_PATH"
