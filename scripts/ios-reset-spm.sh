#!/usr/bin/env bash
# Reset ios/ to the repo's Swift Package Manager template (no CocoaPods).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"

cd "$ROOT"

REF="main"
if git fetch origin main 2>/dev/null; then
  REF="origin/main"
  echo "→ Fetched origin/main"
else
  echo "WARN: git fetch failed (GitHub auth?). Using local main branch."
  git checkout main 2>/dev/null || true
fi

echo "→ Replacing ios/ from $REF..."
git checkout "$REF" -- ios/

echo "→ Removing leftover CocoaPods artifacts..."
rm -rf \
  "$ROOT/ios/App/Pods" \
  "$ROOT/ios/App/Podfile" \
  "$ROOT/ios/App/Podfile.lock" \
  "$ROOT/ios/App/App.xcworkspace"

if grep -qi 'Pods-App\|\[CP\]' "$PBX" 2>/dev/null; then
  echo ""
  echo "ERROR: project.pbxproj still references CocoaPods."
  echo "Your local git copy may be outdated (git pull failed?)."
  echo ""
  echo "Fix in Xcode instead:"
  echo "  1. App target → Build Settings → search 'configuration file'"
  echo "  2. Set Debug to debug.xcconfig (not Pods-App.debug.xcconfig)"
  echo "  3. Build Phases → delete all [CP] ... phases"
  echo "  4. Clean Build Folder → Run"
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
