#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "build-dmg.sh must run on macOS." >&2
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

APP_NAME="readani"
TAURI_TARGET="${TAURI_TARGET:-universal-apple-darwin}"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Lite Guo (T96QFDVD9V)}"

if [[ "$TAURI_TARGET" == "universal-apple-darwin" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    rustup target add x86_64-apple-darwin
  else
    rustup target add aarch64-apple-darwin
  fi
fi

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Building signed macOS DMG..."
bun run tauri build --bundles dmg --target "$TAURI_TARGET"

DMG_PATH=$(find "$ROOT_DIR/src-tauri/target" -path "*/bundle/dmg/${APP_NAME}_*.dmg" -type f | sort | tail -n 1)
APP_PATH=$(find "$ROOT_DIR/src-tauri/target" -path "*/bundle/macos/${APP_NAME}.app" -type d | sort | tail -n 1)

if [[ -z "${DMG_PATH:-}" || ! -f "$DMG_PATH" ]]; then
  echo "Could not find the generated DMG." >&2
  exit 1
fi

if [[ -z "${APP_PATH:-}" || ! -d "$APP_PATH" ]]; then
  echo "Could not find the generated app bundle." >&2
  exit 1
fi

echo "Done."
echo "App: $APP_PATH"
echo "DMG: $DMG_PATH"
