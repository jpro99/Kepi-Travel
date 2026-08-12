import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  IOS_BUNDLE_ID,
  IOS_CAPACITOR_SPM_GIT,
  IOS_DISPLAY_NAME,
  IOS_SPM_TOOLS_VERSION,
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
  assert.match(plist, /WKAppBoundDomains/);
  assert.match(plist, /kepitravel\.com/);
  assert.match(plist, /UIStatusBarStyleDarkContent/);
  assert.doesNotMatch(plist, /UIStatusBarStyleLightContent/);
});
