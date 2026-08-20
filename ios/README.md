# iOS Capacitor wrapper

Native shell loads **https://kepitravel.com** in a WKWebView so you and your partner get the latest trip UI without an App Store update for every web change.

Open **`ios/App/App.xcodeproj`** — not `.xcworkspace`. This project uses **Swift Package Manager** (`CapApp-SPM`), not CocoaPods. Do not use CocoaPods.

Always + Precise family GPS runs only in this native app (TestFlight or ▶ Run). Safari Add to Home Screen cannot keep GPS on when the phone is locked.

## TestFlight (both iPad and iPhone)

1. Quit Xcode (⌘Q), then in Terminal:

   ```bash
   cd ~/Documents/Kepi-Travel
   unset SDKROOT
   git checkout -- package-lock.json
   git fetch origin main
   git checkout origin/main -- ios/ scripts/ios-fix-capapp-spm.sh
   git pull origin main
   npm install
   npm run ios:fix
   open ios/App/App.xcodeproj
   ```

2. Signing & Capabilities → **App** target → **Debug and Release** → Team **Jeffery Russell**, Automatically manage signing, bundle `com.kepitravel.app`. Archive uses **Release** — Team on Debug only is why TestFlight fails.

3. Destination must be **Any iOS Device (arm64)** — not Simulator, not **My Mac (Designed for iPhone)**. Those cannot Archive.

4. **Product → Clean Build Folder**, then **Product → Archive**. Wait until the Organizer window lists the archive.

5. **Distribute App → App Store Connect → Upload** (not Ad Hoc, not Development). Encryption: **No** (ITSAppUsesNonExemptEncryption is already false).

6. First time only: [App Store Connect](https://appstoreconnect.apple.com) → My Apps → **+** → New App → iOS, bundle `com.kepitravel.app`, name **Kepi Travel**.

7. After processing (email / TestFlight tab): Internal Testing → add **your Apple ID** and **hers**. She installs the **TestFlight** app from the App Store, accepts the invite, installs **Kepi Travel**.

8. On her phone, open Kepi → sign in → Map → Family → **Start sharing**. When iOS asks: Allow, then Settings → Kepi Travel → Location → **Always** + **Precise Location**. After that she does not approve again.

### Blue / blank screen on device

The Aug 14 TestFlight build is stale. Always:

1. `git pull origin main` — build **11** or newer (`CURRENT_PROJECT_VERSION` in Xcode).
2. `npm run ios:fix` — writes `public/index.html` + `capacitor.config.json`.
3. Xcode: **Product → Clean Build Folder** → pick the physical iPhone → **Run** (not Archives).
4. Delete the old Kepi icon on the phone first, then Run installs fresh.
5. You should briefly see **Opening Kepi Travel…** then the **sign-in** page — not a solid blue screen.

If Safari opens `https://kepitravel.com` on her phone but the app stays blue, the Mac did not install build 11+ — repeat steps 1–4.

If Archive is gray: destination is still a simulator or Mac. Switch to **Any iOS Device (arm64)**.

If signing errors: Team on **Release**, not only Debug.

## Local cable install (one device)

Product → Destination → **Jeff's iPad** or her iPhone → ▶ Run. Same Always prompt. Stop in Xcode, unplug, open the icon.

## SPM errors

```bash
unset SDKROOT
cd /tmp && rm -rf hellospm && mkdir hellospm && cd hellospm
swift package init --type library
swift package resolve
```

- If **hellospm fails** → Xcode/Swift on the Mac, not Kepi. Try `unset SDKROOT`. Do not reinstall Homebrew or CocoaPods.
- If you see **NUCLEAR fix** or `project.pbxproj still references CocoaPods`: Quit Xcode, then `git checkout origin/main -- ios/` and `npm run ios:fix`.
- If Xcode says **Supported platforms … is empty**: same cause — restore `ios/` from main, then Clean → Run.

## Privacy strings (already in Info.plist)

Location Always + Precise (family map), notifications, camera/photos. First TestFlight launch asks — she should choose **Always Allow** and keep **Precise Location** on.
