#!/usr/bin/env bash
# Fix CapApp-SPM "Missing or empty JSON output from manifest compilation"
# for a fresh Xcode install / stale SPM cache on macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PKG="$ROOT/ios/App/CapApp-SPM/Package.swift"
PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"

echo "==> Kepi iOS CapApp-SPM fix"
echo "    repo: $ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "WARN: This script is meant to run on Jeff's Mac (Darwin)."
  echo "      Continuing with Package.swift rewrite + sync only."
fi

echo "==> Close Xcode (⌘Q) before continuing if it is open."

echo "==> Fetch latest main (do not wipe local capacitor.config)"
if git fetch origin main 2>/dev/null; then
  # Only reset ios/ when CocoaPods leftovers are present
  if grep -qi 'Pods-App\|\[CP\]' "$PBX" 2>/dev/null || [[ -d "$ROOT/ios/App/Pods" ]]; then
    echo "    CocoaPods leftovers detected — restoring ios/ from origin/main"
    git checkout origin/main -- ios/
  fi
else
  echo "WARN: git fetch failed — using local files"
fi

echo "==> Remove CocoaPods leftovers (SPM-only project)"
rm -rf \
  "$ROOT/ios/App/Pods" \
  "$ROOT/ios/App/Podfile" \
  "$ROOT/ios/App/Podfile.lock" \
  "$ROOT/ios/App/App.xcworkspace"

echo "==> Clear Xcode / SwiftPM caches"
if [[ "$(uname -s)" == "Darwin" ]]; then
  rm -rf "$HOME/Library/Developer/Xcode/DerivedData"
  rm -rf "$HOME/Library/Caches/org.swift.swiftpm"
  rm -rf "$HOME/Library/org.swift.swiftpm"
  rm -rf "$ROOT/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
  rm -rf "$ROOT/ios/App/CapApp-SPM/.build"
  rm -rf "$ROOT/ios/App/CapApp-SPM/.swiftpm"
fi

echo "==> npm install (CapApp-SPM needs node_modules plugins)"
npm install

echo "==> Capacitor sync ios (regenerates CapApp-SPM + plugin symlinks)"
npx cap sync ios

if [[ ! -f "$PKG" ]]; then
  echo "ERROR: $PKG missing after sync"
  exit 1
fi

echo "==> Normalize Package.swift (forward slashes + tools 5.9)"
python3 - <<'PY'
from pathlib import Path
import re
pkg = Path("ios/App/CapApp-SPM/Package.swift")
text = pkg.read_text(encoding="utf-8")
fixed = text.replace("\\\\", "/").replace("\\", "/")
fixed = re.sub(
    r"^// swift-tools-version:\s*[^\n]+",
    "// swift-tools-version: 5.9",
    fixed,
    count=1,
    flags=re.M,
)
if fixed != text:
    pkg.write_text(fixed, encoding="utf-8")
    print("    rewrote Package.swift")
else:
    print("    Package.swift already clean")
print("--- Package.swift ---")
print(pkg.read_text(encoding="utf-8"))
PY

echo "==> Verify CapApp-SPM path dependencies exist"
python3 - <<'PY'
from pathlib import Path
import re, sys
pkg = Path("ios/App/CapApp-SPM/Package.swift")
text = pkg.read_text(encoding="utf-8")
if re.search(r'path:\s*"[^"]*\\[^"]*"', text):
    print("ERROR: Package.swift still has backslash paths")
    sys.exit(1)
if re.search(r"^// swift-tools-version:\s*6\.", text, flags=re.M):
    print("ERROR: CapApp-SPM still on swift-tools-version 6.x (use 5.9)")
    sys.exit(1)
paths = re.findall(r'path:\s*"([^"]+)"', text)
ok = True
for p in paths:
    resolved = (pkg.parent / p).resolve()
    exists = resolved.exists()
    print(f"    {p} -> {resolved} [{'OK' if exists else 'MISSING'}]")
    if not exists:
        ok = False
if not ok:
    print("ERROR: one or more CapApp-SPM path deps are missing — run npm install && npx cap sync ios")
    sys.exit(1)
print("    all CapApp-SPM path dependencies resolve")
PY

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "==> Resolve packages from CLI (surfaces real Swift errors)"
  if command -v xcodebuild >/dev/null 2>&1; then
    xcodebuild -project "$ROOT/ios/App/App.xcodeproj" \
      -scheme App \
      -destination 'generic/platform=iOS Simulator' \
      -resolvePackageDependencies || {
        echo "WARN: xcodebuild package resolve failed — open Xcode and check the report"
      }
  fi
  echo "==> Opening App.xcodeproj (NOT .xcworkspace)"
  open "$ROOT/ios/App/App.xcodeproj"
fi

echo ""
echo "OK — next in Xcode:"
echo "  1. File → Packages → Reset Package Caches"
echo "  2. File → Packages → Resolve Package Versions"
echo "  3. Product → Clean Build Folder"
echo "  4. Pick iPhone simulator → ▶ Run"
echo ""
echo "Do NOT open App.xcworkspace. Do NOT run pod install."
