"use client";

import { useEffect } from "react";
import { isStaleBundleError, recoverStaleClientBundle } from "@/lib/pwa/recoverStaleClientBundle";
import { isNative } from "@/lib/native/platform";

/**
 * Lives in the root layout so a Plan-tab render crash cannot skip the
 * service-worker update. The page-level toast copy in travel-assistant
 * still runs when that tree mounts.
 */
export function DeployRefresh() {
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

  // next-pwa's `register: true` auto-injection relies on a Pages Router
  // _app/_document entry graph — it does not fire under the App Router, so
  // the service worker was never actually registering despite next-pwa
  // building it correctly. Register it here explicitly instead. Skip inside
  // the Capacitor native wrapper (no SW there; disabled at build time too)
  // and in dev (no /sw.js is emitted — see next.config.js's `disable`).
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
    const onControllerChange = (): void => {
      if (reloading || !hadControllerAtMount) return;
      reloading = true;
      window.setTimeout(() => window.location.reload(), 400);
    };
    sw.addEventListener("controllerchange", onControllerChange);
    const checkForUpdate = (): void => {
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
