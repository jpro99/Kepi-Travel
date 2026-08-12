# iOS Capacitor wrapper

Native shell loads **https://kepitravel.com** in a WKWebView so you and your partner get the latest trip UI without an App Store update for every web change.

Open **`ios/App/App.xcodeproj`** — not `.xcworkspace`. This project uses **Swift Package Manager** (`CapApp-SPM`), not CocoaPods.

## You + partner (TestFlight)

1. On the Mac: `cd ~/Documents/Kepi-Travel && git pull && npm install && npm run ios:sync`
2. `open ios/App/App.xcodeproj`
3. Signing & Capabilities → Team (your Apple Developer account)
4. Bundle ID must be `com.kepitravel.app`
5. Product → Destination → **your iPhone** (or hers, one at a time) → ▶ Run for a local install
6. For both phones without cables: **Product → Archive → Distribute App → App Store Connect → TestFlight**
7. In App Store Connect, add her Apple ID as an **Internal Tester**, then she installs **TestFlight** and Kepi

If Swift Package Manager is broken on this Mac (`hellospm` fails `swift package resolve`), use Safari → Share → **Add to Home Screen** on kepitravel.com until Xcode SPM works. The web app is the same trip.

## SPM / CocoaPods errors

```bash
unset SDKROOT
cd /tmp && rm -rf hellospm && mkdir hellospm && cd hellospm
swift package init --type library
swift package resolve
```

- If **hellospm fails** → Xcode/Swift on the Mac, not Kepi. Reinstall Xcode or try `unset SDKROOT`.
- If Xcode wants `Pods-App.debug.xcconfig`: `npm run ios:reset` then open `.xcodeproj`.

## Privacy strings (already in Info.plist)

Location (airport + family map), notifications (gate/delay), camera/photos (trip memories). First launch on her phone will ask — she should Allow notifications and location **While Using** (Always only if you use family map while locked).
