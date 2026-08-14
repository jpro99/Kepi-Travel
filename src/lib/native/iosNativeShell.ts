/**
 * Native iOS shell (Capacitor + CapApp-SPM).
 * G22 — SPM-safe tools 5.9, remote Capacitor core, light WKWebView chrome.
 */

export const IOS_SPM_TOOLS_VERSION = "5.9";
export const IOS_BUNDLE_ID = "com.kepitravel.app";
export const IOS_DISPLAY_NAME = "Kepi Travel";
export const IOS_WEBVIEW_BACKGROUND = "#F5F5F7";
export const IOS_PRODUCTION_URL = "https://kepitravel.com";
export const IOS_CAPACITOR_SPM_GIT = "https://github.com/ionic-team/capacitor-swift-pm.git";

/** Local node_modules path deps break Xcode 26 CapApp-SPM manifest compilation. */
export function capAppSpmAllowsLocalNodeModules(): boolean {
  return false;
}

export function iosSpmUsesSwiftTools6(): boolean {
  return false;
}
