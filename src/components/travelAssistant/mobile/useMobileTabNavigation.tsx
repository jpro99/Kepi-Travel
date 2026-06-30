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
      const params = new URLSearchParams(window.location.search);
      params.set("mtab", tab);
      router.replace(`/travel-assistant?${params.toString()}`, { scroll: false });
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
