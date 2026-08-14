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

DEBUGXC="$ROOT/ios/debug.xcconfig"
cat > "$DEBUGXC" <<'XCC'
# Must stay false on device installs. true makes the app wait for the Mac
# debug server — unplug or open from the icon and you get a blank blue screen.
CAPACITOR_DEBUG = false
XCC
echo "    wrote debug.xcconfig (CAPACITOR_DEBUG=false)"

mkdir -p "$ROOT/ios/App/App/public"
cat > "$ROOT/ios/App/App/public/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=https://kepitravel.com" />
    <title>Kepi Travel</title>
    <script>location.replace("https://kepitravel.com");</script>
  </head>
  <body>Opening Kepi…</body>
</html>
HTML
echo "    wrote public/index.html (Capacitor will not exit without this folder)"

cat > "$ROOT/ios/App/App/config.xml" <<'XML'
<?xml version='1.0' encoding='utf-8'?>
<widget version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
  <access origin="*" />
</widget>
XML
echo "    wrote config.xml"

CAPJSON="$ROOT/ios/App/App/capacitor.config.json"
cat > "$CAPJSON" <<'JSON'
{
  "appId": "com.kepitravel.app",
  "appName": "Kepi Travel",
  "webDir": "out",
  "server": {
    "url": "https://kepitravel.com",
    "cleartext": false,
    "allowNavigation": [
      "kepitravel.com",
      "*.kepitravel.com",
      "*.clerk.com",
      "*.clerk.accounts.dev"
    ]
  },
  "ios": {
    "backgroundColor": "#F5F5F7",
    "contentInset": "automatic",
    "scrollEnabled": true,
    "overrideUserInterfaceStyle": "automatic",
    "limitsNavigationsToAppBoundDomains": false
  }
}
JSON
echo "    wrote capacitor.config.json (https://kepitravel.com)"

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
