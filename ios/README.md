# iOS Capacitor wrapper

Native iOS is required for **background location while the phone is locked**. The web/PWA cannot request Apple's "Always Allow" location permission — Safari pauses GPS when the screen locks.

## Generate and sync

```bash
npx cap add ios
CAPACITOR_BUILD=true npm run build && npx cap sync
```

## Open in Xcode

```bash
open ios/App/App.xcworkspace
```

## Background location (family map while locked)

After generating the native project:

1. In Xcode → **Signing & Capabilities** → add **Background Modes** → enable **Location updates**.
2. In `Info.plist`, set:
   - `NSLocationWhenInUseUsageDescription` — why we need location on the map
   - `NSLocationAlwaysAndWhenInUseUsageDescription` — why family sharing needs updates when locked
3. Add `@capacitor/geolocation` (foreground) and a background geolocation plugin (e.g. community background-geolocation) wired to `/api/family` `update-location`.
4. Ship via TestFlight; users choose **Always Allow** under Settings → Kepi → Location.

Until the native app ships, iPhone users should keep Kepi open or accept that pins refresh when they unlock the phone.
