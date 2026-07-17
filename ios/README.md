# iOS Capacitor wrapper

Native iOS is required for **background location while the phone is locked**. The web/PWA cannot request Apple's "Always Allow" location permission — Safari pauses GPS when the screen locks.

## Generate and sync

```bash
npx cap add ios
CAPACITOR_BUILD=true npm run build && npx cap sync
```

## Open in Xcode

```bash
npm run ios:open
# or: open ios/App/App.xcodeproj
```

**SPM note:** CapApp-SPM is intentionally **remote-only** (Capacitor core via `capacitor-swift-pm` on GitHub). Local `node_modules` plugin path deps caused Xcode 26 *"Missing or empty JSON output from manifest compilation for capapp-spm"* on Macs with the repo under Documents/iCloud. Do not bump CapApp-SPM to swift-tools-version 6.0.

If Xcode shows that CapApp-SPM error, quit Xcode and run:

```bash
npm run ios:fix
```

Then: **File → Packages → Reset Package Caches** → **Resolve Package Versions** → **Product → Clean Build Folder** → ▶ Run. Diagnostics land in `ios-capapp-spm-diagnose.txt`.

**CocoaPods / Pods-App.debug.xcconfig error:** This project uses **SPM only** — no `Podfile`, no `Pods/` folder. If Xcode errors on `Pods-App.debug.xcconfig` or `[CP] Embed Pods Frameworks`, your local `ios/` folder is stale (old CocoaPods template). Close Xcode, then reset from git:

```bash
cd ~/Documents/Kepi-Travel
git pull origin main
git checkout origin/main -- ios/
npm install
npm run ios:sync
open ios/App/App.xcodeproj
```

Open **`App.xcodeproj`** — not `App.xcworkspace`.

## Background location (family map while locked)

After generating the native project:

1. In Xcode → **Signing & Capabilities** → add **Background Modes** → enable **Location updates**.
2. In `Info.plist`, set:
   - `NSLocationWhenInUseUsageDescription` — why we need location on the map
   - `NSLocationAlwaysAndWhenInUseUsageDescription` — why family sharing needs updates when locked
3. Add `@capacitor/geolocation` (foreground) and a background geolocation plugin (e.g. community background-geolocation) wired to `/api/family` `update-location`.
4. Ship via TestFlight; users choose **Always Allow** under Settings → Kepi → Location.

Until the native app ships, iPhone users should keep Kepi open or accept that pins refresh when they unlock the phone.
