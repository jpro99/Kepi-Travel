"use client";

import { useEffect } from "react";
import { isStandaloneApp } from "@/lib/ui/isStandaloneApp";

const STANDALONE_VIEWPORT =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover";

/**
 * iOS/Android home-screen PWAs can render the page zoomed-out (tiny UI) without an
 * explicit viewport lock. Browser tabs get the correct scale from Next.js metadata;
 * standalone mode needs this runtime patch so the app matches the website.
 */
export function StandaloneViewportFix() {
  useEffect(() => {
    if (!isStandaloneApp()) return;

    document.documentElement.classList.add("kepi-standalone");

    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute("content", STANDALONE_VIEWPORT);
    }

    const preventGestureZoom = (event: Event): void => {
      event.preventDefault();
    };

    // Pinch-zoom in standalone can leave the UI scaled incorrectly on iOS.
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false });

    return () => {
      document.documentElement.classList.remove("kepi-standalone");
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
    };
  }, []);

  return null;
}
