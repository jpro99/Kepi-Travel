# iOS Capacitor wrapper

Native iOS is required for **background location while the phone is locked**. The web/PWA cannot request Apple's "Always Allow" location permission — Safari pauses GPS when the screen locks.

**Bundle ID:** `com.kepitravel.app` (must match App Store Connect).  
**Display name:** Kepi Travel.

## TestFlight (Jeff — current path)

Jeff’s Mac uses **CocoaPods** (`App.xcworkspace`), not SPM. Simulator already works. Last blocker was signing: *team has no devices* → plug in iPhone once, then Archive.

1. Paid **Apple Developer Program** ($99) required for TestFlight (free Personal Team cannot ship TestFlight).
2. Open `ios/App/App.xcworkspace` → **TARGETS → App → Signing & Capabilities** → Team + Automatically manage signing.
3. Plug in iPhone → ▶ Run once (registers device) → clear red signing errors.
4. Destination **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. [App Store Connect](https://appstoreconnect.apple.com) → Apps → create **Kepi Travel** with bundle id `com.kepitravel.app` → **TestFlight** tab → add yourself → install via TestFlight app on iPhone.
6. **Mac:** use https://kepitravel.com in the browser today. After TestFlight, Apple Silicon Macs can also run the iPhone app; a separate Mac App Store build is not set up yet.

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
