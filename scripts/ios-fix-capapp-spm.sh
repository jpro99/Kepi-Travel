#!/usr/bin/env bash
# Fix CapApp-SPM "Missing or empty JSON output from manifest compilation"
# Nuclear approach: CapApp-SPM depends only on remote capacitor-swift-pm
# (no local node_modules / symlink path packages).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PKG="$ROOT/ios/App/CapApp-SPM/Package.swift"
PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"
DIAG="$ROOT/ios-capapp-spm-diagnose.txt"

echo "==> Kepi iOS CapApp-SPM NUCLEAR fix"
echo "    repo: $ROOT"
echo "==> Quit Xcode (⌘Q) before this if it is open."

write_nuclear_package() {
  mkdir -p "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM"
  if [[ ! -f "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift" ]]; then
    printf 'public let isCapacitorApp = true\n' > "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift"
  fi
  cat > "$PKG" <<'SWIFT'
// swift-tools-version: 5.9
import PackageDescription

// CapApp-SPM — REMOTE-ONLY Capacitor core (no local node_modules path deps).
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ]
        )
    ]
)
SWIFT
  # Drop broken local plugin symlinks if present
  rm -rf "$ROOT/ios/App/CapApp-SPM/symlinks"
  echo "    wrote nuclear CapApp-SPM Package.swift (remote-only)"
}

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "==> Point CLI at full Xcode + accept license + first launch"
  if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer || true
  fi
  sudo xcodebuild -license accept 2>/dev/null || true
  xcodebuild -runFirstLaunch 2>/dev/null || true
fi

echo "==> Remove CocoaPods leftovers (SPM-only project)"
rm -rf \
  "$ROOT/ios/App/Pods" \
  "$ROOT/ios/App/Podfile" \
  "$ROOT/ios/App/Podfile.lock" \
  "$ROOT/ios/App/App.xcworkspace"

if grep -qi 'Pods-App\|\[CP\]' "$PBX" 2>/dev/null; then
  echo "ERROR: project.pbxproj still references CocoaPods."
  echo "Run: git checkout origin/main -- ios/   then re-run this script."
  exit 1
fi

echo "==> Clear Xcode / SwiftPM caches"
if [[ "$(uname -s)" == "Darwin" ]]; then
  rm -rf "$HOME/Library/Developer/Xcode/DerivedData"
  rm -rf "$HOME/Library/Caches/org.swift.swiftpm"
  rm -rf "$HOME/Library/org.swift.swiftpm"
  rm -rf "$ROOT/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
  rm -rf "$ROOT/ios/App/CapApp-SPM/.build"
  rm -rf "$ROOT/ios/App/CapApp-SPM/.swiftpm"
fi

echo "==> npm install"
npm install

echo "==> Capacitor sync (may rewrite Package.swift — we overwrite next)"
npx cap sync ios || true

echo "==> Force nuclear CapApp-SPM (remote capacitor-swift-pm only)"
write_nuclear_package

{
  echo "=== Kepi CapApp-SPM diagnose $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "repo=$ROOT"
  echo "uname=$(uname -a 2>/dev/null || true)"
  echo "xcode-select=$(xcode-select -p 2>/dev/null || true)"
  echo "swift=$(swift --version 2>&1 | head -3 || true)"
  echo "xcodebuild=$(xcodebuild -version 2>&1 | head -3 || true)"
  echo "node=$(node -v 2>/dev/null || true)"
  echo "--- Package.swift ---"
  cat "$PKG"
  echo "--- dump-package ---"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    (cd "$ROOT/ios/App/CapApp-SPM" && xcrun swift package dump-package) 2>&1 || echo "dump-package FAILED (exit $?)"
  else
    echo "(skipped — not Darwin)"
  fi
} | tee "$DIAG"

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "==> xcodebuild resolve packages"
  xcodebuild -project "$ROOT/ios/App/App.xcodeproj" \
    -scheme App \
    -destination 'generic/platform=iOS Simulator' \
    -resolvePackageDependencies 2>&1 | tee -a "$DIAG" || {
      echo "WARN: package resolve failed — see $DIAG"
    }
  echo "==> Opening App.xcodeproj"
  open "$ROOT/ios/App/App.xcodeproj"
fi

echo ""
echo "OK — nuclear CapApp-SPM written."
echo "Diagnostics saved to: $DIAG"
echo "Paste that file (or the dump-package section) if Xcode still fails."
echo ""
echo "In Xcode:"
echo "  1. File → Packages → Reset Package Caches"
echo "  2. File → Packages → Resolve Package Versions"
echo "  3. Product → Clean Build Folder → ▶ Run"
echo "Do NOT open App.xcworkspace. Do NOT run pod install."
