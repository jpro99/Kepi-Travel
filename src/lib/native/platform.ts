/**
 * Platform detection helpers for Kepi Travel native (Capacitor) builds.
 *
 * Safe to call on both server and client — all checks guard against
 * server-side rendering by testing `typeof window` first.
 *
 * Import these instead of accessing Capacitor APIs directly so that
 * platform logic stays in one place and server rendering never throws.
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

/** True when running inside the Capacitor iOS wrapper specifically. */
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
 * True when the app is running as a PWA added to the home screen
 * OR inside the Capacitor native wrapper.
 * Useful for suppressing browser chrome, showing native-style UI, etc.
 */
export function isAppMode(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as { standalone?: boolean }).standalone))
  );
}

// ---------------------------------------------------------------------------
// Safe-area inset helpers
// ---------------------------------------------------------------------------

/**
 * Raw CSS env() inset values in pixels.
 * Returns zeros on server or when the browser does not support env().
 * The layout already injects --sat / --sar / --sab / --sal custom
 * properties via the StandaloneViewportFix component, so prefer using
 * those CSS vars directly in Tailwind / inline styles when possible.
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
  const px = (prop: string) =>
    parseFloat(style.getPropertyValue(prop).trim() || "0") || 0;
  return {
    top: px("--sat"),
    right: px("--sar"),
    bottom: px("--sab"),
    left: px("--sal"),
  };
}

// ---------------------------------------------------------------------------
// Status bar helper
// ---------------------------------------------------------------------------

/**
 * Applies the correct status bar icon colour for the current screen.
 * No-op in web context — Capacitor StatusBar plugin only runs natively.
 */
export async function setStatusBarStyle(
  style: "dark" | "light" | "default" = "default",
): Promise<void> {
  if (!isIOS()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const mapped =
      style === "dark"
        ? Style.Dark
        : style === "light"
          ? Style.Light
          : Style.Default;
    await StatusBar.setStyle({ style: mapped });
  } catch {
    // Ignore — StatusBar plugin not available in web context.
  }
}
