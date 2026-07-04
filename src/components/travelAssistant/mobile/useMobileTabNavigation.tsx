"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { MobileTabBar } from "@/components/travelAssistant/mobile/MobileTabBar";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";

export function useMobileTabNavigation(
  activeTab?: MobilePrimaryTab,
  onNavigate?: (tab: MobilePrimaryTab) => void,
) {
  const router = useRouter();

  const navigateMobileTab = useCallback(
    (tab: MobilePrimaryTab): void => {
      if (onNavigate) {
        onNavigate(tab);
        return;
      }
      const target = `/travel-assistant?mtab=${encodeURIComponent(tab)}`;
      // Full-screen /live-map keeps a WebGL canvas alive; hard navigation reliably exits on mobile.
      if (typeof window !== "undefined" && window.location.pathname.includes("/live-map")) {
        window.location.assign(target);
        return;
      }
      router.push(target);
    },
    [onNavigate, router],
  );

  return { activeTab, navigateMobileTab };
}

interface MobileTabBarNavProps {
  activeTab?: MobilePrimaryTab;
  /** When provided, updates tab state immediately (required on /travel-assistant). */
  onSelectTab?: (tab: MobilePrimaryTab) => void;
}

export function MobileTabBarNav({ activeTab, onSelectTab }: MobileTabBarNavProps) {
  const { navigateMobileTab } = useMobileTabNavigation(activeTab, onSelectTab);
  return <MobileTabBar activeTab={activeTab} onSelectTab={navigateMobileTab} />;
}
