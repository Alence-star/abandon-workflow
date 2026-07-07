#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to build Abandon for iOS."
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "This script must run on macOS with Xcode installed."
  exit 1
fi

export CI="${CI:-true}"
EXPORT_METHOD="${EXPORT_METHOD:-ad-hoc}"

echo "==> Installing dependencies"
npm ci

echo "==> Building frontend"
npm run build

echo "==> Initializing iOS project"
npm exec tauri ios init

echo "==> Building iOS package (${EXPORT_METHOD})"
npm exec tauri ios build -- --export-method "$EXPORT_METHOD"

echo
echo "Build complete. Artifacts:"
find "$PROJECT_DIR/src-tauri/gen/apple/build" \
  \( -name "*.ipa" -o -name "*.xcarchive" -o -name "*.app" \) \
  -print
