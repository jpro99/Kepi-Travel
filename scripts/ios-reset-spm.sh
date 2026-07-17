#!/usr/bin/env bash
# Reset ios/ to the repo's Swift Package Manager template (no CocoaPods).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"

cd "$ROOT"

echo "→ Fetching latest main..."
git fetch origin main

echo "→ Replacing ios/ from origin/main..."
git checkout origin/main -- ios/

echo "→ Removing leftover CocoaPods artifacts..."
rm -rf \
  "$ROOT/ios/App/Pods" \
  "$ROOT/ios/App/Podfile" \
  "$ROOT/ios/App/Podfile.lock" \
  "$ROOT/ios/App/App.xcworkspace"

if grep -qi 'Pods-App\|\[CP\]' "$PBX" 2>/dev/null; then
  echo "ERROR: project.pbxproj still references CocoaPods after reset."
  echo "Run: grep -i pods $PBX"
  exit 1
fi

if ! grep -q 'debug.xcconfig' "$PBX"; then
  echo "ERROR: project.pbxproj missing debug.xcconfig (SPM config)."
  exit 1
fi

echo "→ Syncing Capacitor iOS (SPM)..."
npm run ios:sync

echo ""
echo "OK — ios/ is SPM. Open Xcode with:"
echo "  open ios/App/App.xcodeproj"
echo ""
echo "Then: Product → Clean Build Folder (⇧⌘K) → ▶ Run"
