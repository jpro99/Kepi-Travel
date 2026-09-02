"use client";

import { useEffect, useState } from "react";

/**
 * Keeps fixed chat shells above the iOS/Android virtual keyboard.
 * Returns keyboard overlap (px) and optional visual viewport height.
 */
export function useMobileChatViewport(enabled: boolean): {
  keyboardInsetPx: number;
  viewportHeightPx: number | null;
  viewportOffsetTopPx: number;
} {
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState<number | null>(null);
  const [viewportOffsetTopPx, setViewportOffsetTopPx] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setKeyboardInsetPx(0);
      setViewportHeightPx(null);
      setViewportOffsetTopPx(0);
      return;
    }

    const update = (): void => {
      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardInsetPx(0);
        setViewportHeightPx(null);
        setViewportOffsetTopPx(0);
        return;
      }
      const overlap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInsetPx(overlap);
      setViewportHeightPx(Math.round(vv.height));
      setViewportOffsetTopPx(Math.round(vv.offsetTop));
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled]);

  return { keyboardInsetPx, viewportHeightPx, viewportOffsetTopPx };
}
