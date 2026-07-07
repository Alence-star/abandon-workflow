#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to build Abandon."
  exit 1
fi

echo "==> Installing dependencies"
npm ci

echo "==> Building frontend"
npm run build

if [ -z "${APPLE_CERTIFICATE:-}" ] && [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  export APPLE_SIGNING_IDENTITY="-"
  echo "==> No Apple certificate found, using ad-hoc signing for internal macOS testing"
else
  echo "==> Using configured Apple signing settings"
fi

echo "==> Building macOS app bundle and DMG"
npm run tauri build -- --bundles app,dmg

echo
echo "Build complete. Artifacts:"
find "$PROJECT_DIR/src-tauri/target/release/bundle" \
  \( -name "*.app" -o -name "*.dmg" -o -name "*.sig" \) \
  -print

echo
echo "For notarized public distribution, provide Apple signing and notarization"
echo "environment variables before running this script."
