"use client";

import { useEffect } from "react";
import { isStaleBundleError, recoverStaleClientBundle } from "@/lib/pwa/recoverStaleClientBundle";

/**
 * Lives in the root layout so a Plan-tab render crash cannot skip the
 * service-worker update. The page-level toast copy in travel-assistant
 * still runs when that tree mounts.
 */
export function DeployRefresh() {
  useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      if (isStaleBundleError({ message: event.message })) {
        void recoverStaleClientBundle();
      }
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
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
