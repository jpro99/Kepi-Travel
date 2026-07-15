"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isNative } from "@/lib/native/platform";

interface SplashTransitionProps {
  children: ReactNode;
}

/**
 * Shows a full-screen Kepi splash (gold "K" on deep navy) while the
 * Capacitor WKWebView finishes hydrating, then fades out.
 * On web this component is transparent — children render immediately.
 */
export function SplashTransition({ children }: SplashTransitionProps) {
  const nativeContext = useMemo(() => isNative(), []);
  const [visible, setVisible] = useState(nativeContext);

  useEffect(() => {
    if (!nativeContext) return;
    // Give React one frame to paint, then wait for the web content to settle.
    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [nativeContext]);

  return (
    <>
      {visible ? (
        <div
          aria-hidden
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
          style={{ backgroundColor: "#0b1f3a" }}
        >
          {/* Gold Kepi mark */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: "#c9a84c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontWeight: 900,
                fontSize: 44,
                color: "#0b1f3a",
                lineHeight: 1,
                letterSpacing: "-2px",
              }}
            >
              K
            </span>
          </div>
          <p
            style={{
              marginTop: 18,
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: "#ffffff",
              letterSpacing: "-0.5px",
            }}
          >
            Kepi Travel
          </p>
          <p
            style={{
              marginTop: 6,
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.5px",
            }}
          >
            Loading your trips…
          </p>
        </div>
      ) : null}
      <div
        style={{
          opacity: visible ? 0 : 1,
          transition: visible ? "none" : "opacity 0.3s ease",
        }}
      >
        {children}
      </div>
    </>
  );
}
