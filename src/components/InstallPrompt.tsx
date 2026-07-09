"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/ui/Logo";
import { isAndroidBrowser, isStandaloneApp } from "@/lib/ui/isStandaloneApp";
import { MOBILE_TAB_BAR_CLEARANCE } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_STORAGE_KEY = "kepi-install-dismissed";
/** Keep prompt above the portaled mobile tab bar. */
const MOBILE_TAB_BAR_INSET = MOBILE_TAB_BAR_CLEARANCE;

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showAndroidSteps, setShowAndroidSteps] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateViewport = (): void => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    setIsAndroid(isAndroidBrowser());
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleDismiss = (): void => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
    setDismissed(true);
    setShowAndroidSteps(false);
  };

  const handleInstall = async (): Promise<void> => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isAndroid) {
      setShowAndroidSteps(true);
    }
  };

  const canOfferInstall = Boolean(deferredPrompt) || isAndroid;
  if (!portalReady || !isMobileViewport || dismissed || !canOfferInstall || isStandaloneApp()) {
    return null;
  }

  const prompt = (
    <section
      className="pointer-events-auto fixed inset-x-3 z-[10050] sm:inset-x-auto sm:right-4 sm:w-[22rem]"
      style={{ bottom: `calc(${MOBILE_TAB_BAR_INSET} + 0.75rem)` }}
      aria-label="Install Kepi app"
    >
      <div className="flex max-h-[min(50dvh,22rem)] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white/95 shadow-xl dark:border-slate-700 dark:bg-slate-900/95">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 pb-2">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {isAndroid ? "Install Kepi on your phone?" : "Add to your home screen"}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {showAndroidSteps
              ? "In Chrome, tap the menu (⋮) → Install app or Add to Home screen. You'll get faster launch and flight alerts while traveling."
              : isAndroid
                ? "Get flight alerts and quicker access from your home screen while you travel."
                : "Install for faster launch and better offline reliability while traveling."}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/80 bg-white/95 p-3 dark:border-slate-700/80 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-[44px] rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 touch-manipulation"
          >
            {showAndroidSteps ? "Got it" : "Not now"}
          </button>
          {!showAndroidSteps ? (
            <button
              type="button"
              onClick={() => {
                void handleInstall();
              }}
              className="min-h-[44px] rounded-md bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 touch-manipulation"
            >
              {deferredPrompt ? "Install" : "Show me how"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );

  return createPortal(prompt, document.body);
}
