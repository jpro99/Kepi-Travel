#!/usr/bin/env bash
# Restore CapApp-SPM to remote-only Capacitor core (Swift tools 5.9).
# Also replaces a stale local CocoaPods ios/ tree with origin/main.
# No sudo, no CocoaPods, no DerivedData wipe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/ios/App/CapApp-SPM/Package.swift"
PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"

cd "$ROOT"

echo "==> Kepi iOS CapApp-SPM fix (remote-only, tools 5.9)"
echo "    repo: $ROOT"
echo "    Quit Xcode (⌘Q) if it is open."

restore_ios_from_main() {
  echo "==> Local ios/ still has CocoaPods refs — restoring from origin/main"
  git fetch origin main
  git checkout origin/main -- ios/
}

if [[ -f "$PBX" ]] && grep -qE 'Pods-App|\[CP\]' "$PBX"; then
  restore_ios_from_main
fi

if [[ -f "$PBX" ]] && grep -qE 'Pods-App|\[CP\]' "$PBX"; then
  echo "ERROR: project.pbxproj still references CocoaPods after restore."
  echo "Quit Xcode, then run:"
  echo "  git fetch origin main && git checkout origin/main -- ios/ && npm run ios:fix"
  exit 1
fi

mkdir -p "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM"
if [[ ! -f "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift" ]]; then
  printf 'public let isCapacitorApp = true\n' > "$ROOT/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift"
fi

cat > "$PKG" <<'SWIFT'
// swift-tools-version: 5.9
import PackageDescription

// CapApp-SPM — REMOTE-ONLY Capacitor core (no local node_modules path deps).
// Local plugin paths/symlinks were causing Xcode 26 "Missing or empty JSON
// output from manifest compilation for capapp-spm". Native haptics/push/status-bar
// plugins stay JS-optional until SPM is stable; the WKWebView still loads
// https://kepitravel.com.
//
// `npx cap sync ios` may rewrite this file — re-run `npm run ios:fix` afterward.
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

rm -rf "$ROOT/ios/App/CapApp-SPM/symlinks"
rm -rf \
  "$ROOT/ios/App/Pods" \
  "$ROOT/ios/App/Podfile" \
  "$ROOT/ios/App/Podfile.lock" \
  "$ROOT/ios/App/App.xcworkspace"

echo "    wrote CapApp-SPM Package.swift (remote capacitor-swift-pm 8.4.1)"
echo ""
echo "OK — open ios/App/App.xcodeproj (not .xcworkspace)."
echo "Skip File → Packages if it is gray. In Xcode: Product → Clean Build Folder → pick iPhone → Run."
echo "Do not use CocoaPods."
