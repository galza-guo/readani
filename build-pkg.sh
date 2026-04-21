#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "build-pkg.sh must run on macOS." >&2
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

APP_NAME="readani"
TAURI_TARGET="${TAURI_TARGET:-universal-apple-darwin}"
APPSTORE_CONFIG="src-tauri/tauri.appstore.conf.json"
APPSTORE_PROFILE_PATH="${APPSTORE_PROVISIONING_PROFILE:-$ROOT_DIR/src-tauri/readani.appstore.provisionprofile}"
APP_PATH="$ROOT_DIR/src-tauri/target/$TAURI_TARGET/release/bundle/macos/$APP_NAME.app"
PKG_PATH="${PKG_PATH:-$ROOT_DIR/$APP_NAME.pkg}"

if [[ ! -f "$APPSTORE_PROFILE_PATH" ]]; then
  cat >&2 <<EOF
Missing App Store provisioning profile:
  $APPSTORE_PROFILE_PATH

Download a "Mac App Store Connect" provisioning profile for com.xnu.readani
and save it at that path, or set APPSTORE_PROVISIONING_PROFILE.
EOF
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Set APPLE_SIGNING_IDENTITY to your Apple Distribution certificate." >&2
  exit 1
fi

if [[ -z "${APPLE_INSTALLER_SIGNING_IDENTITY:-}" ]]; then
  echo "Set APPLE_INSTALLER_SIGNING_IDENTITY to your Mac Installer Distribution certificate." >&2
  exit 1
fi

if [[ "$TAURI_TARGET" == "universal-apple-darwin" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    rustup target add x86_64-apple-darwin
  else
    rustup target add aarch64-apple-darwin
  fi
fi

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Building App Store app bundle..."
bun run tauri build -- --bundles app --target "$TAURI_TARGET" --config "$APPSTORE_CONFIG"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found at $APP_PATH" >&2
  exit 1
fi

echo "Creating signed App Store PKG..."
rm -f "$PKG_PATH"
xcrun productbuild \
  --sign "$APPLE_INSTALLER_SIGNING_IDENTITY" \
  --component "$APP_PATH" \
  /Applications \
  "$PKG_PATH"

echo "Done."
echo "PKG: $PKG_PATH"
