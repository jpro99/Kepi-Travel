"use client";

import type { ReactNode } from "react";

interface SplashTransitionProps {
  children: ReactNode;
}

/**
 * Pass-through. A full-screen navy overlay hid the live site in the iOS
 * WKWebView when Capacitor marked the page native and hydration lagged —
 * Jeff saw a blue screen for minutes with the trip already loaded underneath.
 */
export function SplashTransition({ children }: SplashTransitionProps) {
  return <>{children}</>;
}
