# iOS Capacitor wrapper

Native shell loads **https://kepitravel.com** in a WKWebView so you and your partner get the latest trip UI without an App Store update for every web change.

Open **`ios/App/App.xcodeproj`** — not `.xcworkspace`. This project uses **Swift Package Manager** (`CapApp-SPM`), not CocoaPods. Do not use CocoaPods.

## You + partner (TestFlight)

1. On the Mac: quit Xcode, then:

   ```bash
   cd ~/Documents/Kepi-Travel
   git pull origin main
   unset SDKROOT
   npm install
   npm run ios:fix
   open ios/App/App.xcodeproj
   ```

2. Signing & Capabilities → Team (your Apple Developer account)
3. Bundle ID must be `com.kepitravel.app`
4. In Xcode: **File → Packages → Reset Package Caches** → **Resolve Package Versions** → **Product → Clean Build Folder**
5. Product → Destination → **your iPhone** (or hers, one at a time) → ▶ Run for a local install
6. For both phones without cables: **Product → Archive → Distribute App → App Store Connect → TestFlight**
7. In App Store Connect, add her Apple ID as an **Internal Tester**, then she installs **TestFlight** and Kepi

If Swift Package Manager is still broken on this Mac (`hellospm` fails `swift package resolve`), use Safari → Share → **Add to Home Screen** on kepitravel.com until Xcode SPM works. The web app is the same trip.

## SPM errors

```bash
unset SDKROOT
cd /tmp && rm -rf hellospm && mkdir hellospm && cd hellospm
swift package init --type library
swift package resolve
```

- If **hellospm fails** → Xcode/Swift on the Mac, not Kepi. Try `unset SDKROOT`. Do not reinstall Homebrew or CocoaPods.
- If Xcode wants `Pods-App.debug.xcconfig`: `npm run ios:reset` then `npm run ios:fix` and open `.xcodeproj`.
- If CapApp-SPM shows empty JSON after `npx cap sync ios`: `npm run ios:fix` (restores remote-only Swift 5.9).

## Privacy strings (already in Info.plist)

Location (airport + family map), notifications (gate/delay), camera/photos (trip memories). First launch on her phone will ask — she should Allow notifications and location **While Using** (Always only if you use family map while locked).
