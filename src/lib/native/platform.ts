/**
 * Platform detection helpers for Kepi Travel native (Capacitor) builds.
 *
 * Safe to call on both server and client — all checks guard against
 * server-side rendering by testing `typeof window` first.
 */
import { Capacitor } from "@capacitor/core";

// ---------------------------------------------------------------------------
// Core platform checks
// ---------------------------------------------------------------------------

/** True when running inside a Capacitor iOS or Android wrapper. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

/** True when running inside the Capacitor iOS wrapper. */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.getPlatform() === "ios";
}

/** True when running inside the Capacitor Android wrapper. */
export function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.getPlatform() === "android";
}

/**
 * True when the static export was loaded in a WKWebView (native iOS)
 * OR as a PWA added to the home screen.
 * Useful for hiding browser-specific UI (address bar awareness etc.).
 */
export function isAppMode(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone))
  );
}

// ---------------------------------------------------------------------------
// Safe-area helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current safe-area inset values from CSS env() variables.
 * Returns zeros when called on the server or when env() is unsupported.
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === "undefined" || typeof getComputedStyle === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const style = getComputedStyle(document.documentElement);
  const parse = (prop: string) =>
    parseFloat(style.getPropertyValue(prop).trim() || "0") || 0;
  return {
    top: parse("--sat"),
    right: parse("--sar"),
    bottom: parse("--sab"),
    left: parse("--sal"),
  };
}

// ---------------------------------------------------------------------------
// Status-bar helper
// ---------------------------------------------------------------------------

/**
 * Applies the correct status bar style for the current screen.
 * Call after major navigation or theme changes inside native context.
 */
export async function setStatusBarStyle(
  style: "dark" | "light" | "default" = "default",
): Promise<void> {
  if (!isIOS()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const mapped =
      style === "dark" ? Style.Dark : style === "light" ? Style.Light : Style.Default;
    await StatusBar.setStyle({ style: mapped });
  } catch {
    // Ignore — StatusBar plugin not available (web context).
  }
}
