"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isMobilePrimaryTab,
  normalizeMobilePrimaryTab,
  type MobilePrimaryTab,
} from "@/components/travelAssistant/mobile/mobileShellTypes";

const STORAGE_KEY = "kepi:mobile-primary-tab";

function readTabFromUrl(): MobilePrimaryTab | null {
  if (typeof window === "undefined") return null;
  return normalizeMobilePrimaryTab(new URLSearchParams(window.location.search).get("mtab"));
}

function readTabFromStorage(): MobilePrimaryTab | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored && isMobilePrimaryTab(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readInitialMobileTab(): MobilePrimaryTab {
  return readTabFromUrl() ?? readTabFromStorage() ?? "home";
}

function writeTabToUrl(tab: MobilePrimaryTab): void {
  const params = new URLSearchParams(window.location.search);
  params.set("mtab", tab);
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({ mobilePrimaryTab: tab }, "", nextUrl);
}

function persistMobileTab(tab: MobilePrimaryTab): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // sessionStorage may be unavailable in private mode
  }
  writeTabToUrl(tab);
}

/**
 * Mobile bottom-tab state — React state is primary; URL + sessionStorage mirror it.
 * Avoids Next.js router navigation so tab taps never remount the travel-assistant page.
 */
export function useMobilePrimaryTab() {
  const hydratedRef = useRef(false);
  const [mobilePrimaryTab, setMobilePrimaryTab] = useState<MobilePrimaryTab>(readInitialMobileTab);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const fromUrl = readTabFromUrl();
    if (fromUrl) {
      setMobilePrimaryTab(fromUrl);
      persistMobileTab(fromUrl);
      return;
    }
    const fromStorage = readTabFromStorage();
    if (fromStorage) {
      setMobilePrimaryTab(fromStorage);
      writeTabToUrl(fromStorage);
    }
  }, []);

  useEffect(() => {
    const syncFromHistory = (event: PopStateEvent): void => {
      const fromState =
        event.state &&
        typeof event.state === "object" &&
        "mobilePrimaryTab" in event.state &&
        isMobilePrimaryTab((event.state as { mobilePrimaryTab: string }).mobilePrimaryTab)
          ? (event.state as { mobilePrimaryTab: MobilePrimaryTab }).mobilePrimaryTab
          : null;
      const nextTab = fromState ?? readTabFromUrl();
      if (nextTab) {
        setMobilePrimaryTab(nextTab);
        persistMobileTab(nextTab);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const navigateMobilePrimaryTab = useCallback((nextTab: MobilePrimaryTab): void => {
    setMobilePrimaryTab(nextTab);
    persistMobileTab(nextTab);
  }, []);

  return { mobilePrimaryTab, navigateMobilePrimaryTab };
}
