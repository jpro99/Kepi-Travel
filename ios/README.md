# iOS Capacitor wrapper

Native shell loads **https://kepitravel.com** in a WKWebView so you and your partner get the latest trip UI without an App Store update for every web change.

Open **`ios/App/App.xcodeproj`** — not `.xcworkspace`. This project uses **Swift Package Manager** (`CapApp-SPM`), not CocoaPods. Do not use CocoaPods.

## You + partner (TestFlight)

1. On the Mac: quit Xcode (⌘Q), then paste this in **Terminal**:

   ```bash
   cd ~/Documents/Kepi-Travel
   unset SDKROOT
   git fetch origin main
   git checkout origin/main -- ios/ scripts/ios-fix-capapp-spm.sh
   git pull origin main
   npm install
   npm run ios:fix
   open ios/App/App.xcodeproj
   ```

   `git checkout origin/main -- ios/` replaces a stale local CocoaPods project (the “NUCLEAR fix” / `Pods-App` error and empty iPhone destinations).

2. Signing & Capabilities → Team (your Apple Developer account)
3. Bundle ID must be `com.kepitravel.app`
4. Skip **File → Packages** if it is gray. **Product → Clean Build Folder**, pick your iPhone, press **▶ Run**.
5. Product → Destination → **your iPhone** (or hers, one at a time) → ▶ Run for a local install
6. For both phones without cables: **Product → Archive → Distribute App → App Store Connect → TestFlight**
7. In App Store Connect, add her Apple ID as an **Internal Tester**, then she installs **TestFlight** and Kepi

If the Simulator iPhone is a **blank light screen**, Clerk was blocked by app-bound domains (fixed on main). Quit Xcode, `git pull origin main`, `npm run ios:fix`, then ▶ Run again. Sign in with the same Kepi account. For the real phone, pick the physical iPhone at the top — not “iPhone 16”.

## SPM errors

```bash
unset SDKROOT
cd /tmp && rm -rf hellospm && mkdir hellospm && cd hellospm
swift package init --type library
swift package resolve
```

- If **hellospm fails** → Xcode/Swift on the Mac, not Kepi. Try `unset SDKROOT`. Do not reinstall Homebrew or CocoaPods.
- If you see **NUCLEAR fix** or `project.pbxproj still references CocoaPods`: that is an old local `ios/` tree. Quit Xcode, then `git checkout origin/main -- ios/` and `npm run ios:fix`.
- If Xcode says **Supported platforms … is empty**: same cause — restore `ios/` from main, then Clean → Run. Skip File → Packages if it is gray.
- If CapApp-SPM shows empty JSON after `npx cap sync ios`: `npm run ios:fix` (restores remote-only Swift 5.9).

## Privacy strings (already in Info.plist)

Location (airport + family map), notifications (gate/delay), camera/photos (trip memories). First launch on her phone will ask — she should Allow notifications and location **While Using** (Always only if you use family map while locked).
