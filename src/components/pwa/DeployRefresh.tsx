"use client";

import { useEffect } from "react";
import {
  isStaleBundleError,
  recoverStaleClientBundle,
  TDZ_RELOAD_KEY,
} from "@/lib/pwa/recoverStaleClientBundle";
import { isNative } from "@/lib/native/platform";

const UPDATE_CHECK_MIN_MS = 5 * 60_000;

/**
 * Lives in the root layout so a Plan-tab render crash cannot skip the
 * service-worker update. Single owner of SW register + controllerchange reload
 * (travel-assistant must not also reload — that double-reload blanks the screen).
 */
export function DeployRefresh() {
  useEffect(() => {
    // Successful boot: allow a future stale-bundle recovery this session.
    try {
      sessionStorage.removeItem(TDZ_RELOAD_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      if (isStaleBundleError({ message: event.message, name: event.error?.name })) {
        void recoverStaleClientBundle();
      }
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason;
      if (reason instanceof Error && isStaleBundleError(reason)) {
        void recoverStaleClientBundle();
        return;
      }
      if (isStaleBundleError({ message: String(reason ?? "") })) {
        void recoverStaleClientBundle();
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // next-pwa's `register: true` does not fire under the App Router — register
  // explicitly. Skip Capacitor native + dev (no /sw.js emitted).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" || isNative()) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadControllerAtMount = Boolean(sw.controller);
    let reloading = false;
    let lastUpdateCheckMs = 0;

    const onControllerChange = (): void => {
      // First install: page already has fresh JS — reload is a blank flash.
      if (reloading || !hadControllerAtMount) return;
      reloading = true;
      window.setTimeout(() => window.location.reload(), 400);
    };
    sw.addEventListener("controllerchange", onControllerChange);

    const checkForUpdate = (): void => {
      const now = Date.now();
      // I61: visibility thrash was calling update() constantly → skipWaiting
      // storms and blank reload loops on home-screen PWAs.
      if (now - lastUpdateCheckMs < UPDATE_CHECK_MIN_MS) return;
      lastUpdateCheckMs = now;
      void sw.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
    };
    checkForUpdate();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
