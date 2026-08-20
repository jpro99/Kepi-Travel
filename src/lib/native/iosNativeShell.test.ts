import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  IOS_BUNDLE_ID,
  IOS_CAPACITOR_SPM_GIT,
  IOS_DISPLAY_NAME,
  IOS_SPM_TOOLS_VERSION,
  IOS_NATIVE_LOCATION_URL,
  IOS_PRODUCTION_URL,
  IOS_WEBVIEW_BACKGROUND,
  capAppSpmAllowsLocalNodeModules,
  iosSpmUsesSwiftTools6,
} from "@/lib/native/iosNativeShell";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("G22 SPM helpers stay on tools 5.9 without local node_modules", () => {
  assert.equal(IOS_SPM_TOOLS_VERSION, "5.9");
  assert.equal(IOS_BUNDLE_ID, "com.kepitravel.app");
  assert.equal(IOS_DISPLAY_NAME, "Kepi Travel");
  assert.equal(IOS_WEBVIEW_BACKGROUND, "#F5F5F7");
  assert.equal(capAppSpmAllowsLocalNodeModules(), false);
  assert.equal(iosSpmUsesSwiftTools6(), false);
});

test("G22 CapApp-SPM is remote-only Swift 5.9", () => {
  const pkg = readSrc("ios/App/CapApp-SPM/Package.swift");
  assert.match(pkg, /swift-tools-version:\s*5\.9/);
  assert.doesNotMatch(pkg, /swift-tools-version:\s*6/);
  assert.match(pkg, new RegExp(IOS_CAPACITOR_SPM_GIT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(pkg, /path:\s*"/);
  assert.doesNotMatch(pkg, /\.\.\/node_modules/);
  assert.doesNotMatch(pkg, /\\\\/);
  assert.doesNotMatch(pkg, /CapacitorHaptics/);
});

test("G22 Capacitor config is SPM 5.9 + light WKWebView chrome", () => {
  const cap = readSrc("capacitor.config.ts");
  assert.match(cap, /appId:\s*"com\.kepitravel\.app"/);
  assert.match(cap, /swiftToolsVersion:\s*"5\.9"/);
  assert.doesNotMatch(cap, /swiftToolsVersion:\s*"6/);
  assert.match(cap, /backgroundColor:\s*"#F5F5F7"/);
  assert.match(cap, /style:\s*"DARK"/);
  assert.match(cap, /kepitravel\.com/);
});

test("G22 native shell scripts and README stay on App.xcodeproj", () => {
  const readme = readSrc("ios/README.md");
  const fix = readSrc("scripts/ios-fix-capapp-spm.sh");
  const pkgJson = readSrc("package.json");
  assert.match(readme, /App\.xcodeproj/);
  assert.doesNotMatch(readme, /pod install/);
  assert.match(readme, /ios:fix/);
  assert.match(fix, /swift-tools-version: 5\.9/);
  assert.match(fix, /capacitor-swift-pm/);
  assert.match(fix, /origin\/main -- ios/);
  assert.doesNotMatch(fix, /NUCLEAR/);
  assert.doesNotMatch(fix, /sudo /);
  assert.match(pkgJson, /"ios:fix"/);
});

test("G22 App.xcodeproj has no CocoaPods build files", () => {
  const pbx = readSrc("ios/App/App.xcodeproj/project.pbxproj");
  assert.doesNotMatch(pbx, /Pods-App/);
  assert.doesNotMatch(pbx, /\[CP\]/);
  assert.match(pbx, /CapApp-SPM/);
  assert.match(pbx, /com\.kepitravel\.app/);
});

test("G22 Info.plist keeps TestFlight identity + dark status bar on light chrome", () => {
  const plist = readSrc("ios/App/App/Info.plist");
  assert.match(plist, /<string>Kepi Travel<\/string>/);
  assert.match(plist, /UIStatusBarStyleDarkContent/);
  assert.doesNotMatch(plist, /UIStatusBarStyleLightContent/);
});

test("G24 device install loads kepitravel.com without the Mac debugger", () => {
  const bundled = readSrc("ios/App/App/capacitor.config.json");
  const debugXc = readSrc("ios/debug.xcconfig");
  const plist = readSrc("ios/App/App/Info.plist");
  const bridge = readSrc("ios/App/App/KepiBridgeViewController.swift");
  const fallback = readSrc("ios/App/App/public/index.html");
  const storyboard = readSrc("ios/App/App/Base.lproj/Main.storyboard");
  const launch = readSrc("ios/App/App/Base.lproj/LaunchScreen.storyboard");
  const fix = readSrc("scripts/ios-fix-capapp-spm.sh");
  const gitignore = readSrc("ios/.gitignore");
  assert.equal(IOS_PRODUCTION_URL, "https://kepitravel.com");
  assert.match(bundled, /"url":\s*"https:\/\/kepitravel\.com"/);
  assert.match(bundled, /"appId":\s*"com\.kepitravel\.app"/);
  assert.doesNotMatch(debugXc, /^#/m);
  assert.match(debugXc, /^\/\//m);
  assert.doesNotMatch(debugXc, /CAPACITOR_DEBUG = true/);
  assert.match(plist, /<key>CAPACITOR_DEBUG<\/key>\s*<string>false<\/string>/);
  assert.doesNotMatch(plist, /\$\(CAPACITOR_DEBUG\)/);
  assert.match(bridge, /KepiBridgeViewController/);
  assert.match(bridge, /https:\/\/kepitravel\.com/);
  assert.match(bridge, /super\.viewDidLoad/);
  assert.match(bridge, /sign-in/);
  assert.match(bridge, /Opening Kepi Travel/);
  assert.match(bridge, /scheduleLoadRetries/);
  assert.match(bridge, /serverBasePath/);
  const delegate = readSrc("ios/App/App/AppDelegate.swift");
  assert.match(delegate, /loadKepiIfNeeded/);
  assert.match(delegate, /sign-in/);
  const splash = readSrc("src/components/native/SplashTransition.tsx");
  assert.doesNotMatch(splash, /#0b1f3a/);
  assert.doesNotMatch(splash, /opacity:\s*visible \? 0/);
  assert.match(splash, /return <>\{children\}<\/>/);
  assert.match(storyboard, /customClass="KepiBridgeViewController"/);
  assert.match(fallback, /https:\/\/kepitravel\.com/);
  assert.match(launch, /Kepi Travel/);
  assert.doesNotMatch(launch, /image="Splash"/);
  assert.match(fix, /capacitor\.config\.json/);
  assert.match(fix, /public\/index\.html/);
  assert.match(fix, /https:\/\/kepitravel\.com/);
  assert.match(gitignore, /!App\/App\/public\/index\.html/);
});

test("M20 native Always tracker ships in the iOS shell", () => {
  const plist = readSrc("ios/App/App/Info.plist");
  const always = readSrc("ios/App/App/KepiAlwaysLocation.swift");
  const bridge = readSrc("ios/App/App/KepiLocationBridge.swift");
  const vc = readSrc("ios/App/App/KepiBridgeViewController.swift");
  const web = readSrc("src/lib/native/alwaysLocationBridge.ts");
  const mw = readSrc("src/middleware.ts");
  assert.equal(IOS_NATIVE_LOCATION_URL, "https://kepitravel.com/api/family/native-location");
  assert.match(plist, /<string>location<\/string>/);
  assert.match(plist, /NSLocationAlwaysAndWhenInUseUsageDescription/);
  assert.match(plist, /Always Allow/);
  assert.match(always, /allowsBackgroundLocationUpdates = true/);
  assert.match(always, /requestAlwaysAuthorization/);
  assert.match(always, /kCLLocationAccuracyBest/);
  assert.match(bridge, /kepiLocation/);
  assert.match(vc, /KepiLocationBridge/);
  assert.match(web, /location-session/);
  assert.match(web, /kepiLocation/);
  assert.match(mw, /\/api\/family\/native-location/);
});

test("G23 native WKWebView is not app-bound to kepitravel.com only", () => {
  const plist = readSrc("ios/App/App/Info.plist");
  const cap = readSrc("capacitor.config.ts");
  assert.doesNotMatch(plist, /WKAppBoundDomains/);
  assert.match(cap, /limitsNavigationsToAppBoundDomains:\s*false/);
  assert.match(cap, /https:\/\/kepitravel\.com/);
  assert.match(cap, /clerk\.accounts\.dev/);
});
