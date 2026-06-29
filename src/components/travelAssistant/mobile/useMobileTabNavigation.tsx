"use client";

import { useRouter } from "next/navigation";
import { MobileTabBar } from "@/components/travelAssistant/mobile/MobileTabBar";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";

export function useMobileTabNavigation(activeTab: MobilePrimaryTab) {
  const router = useRouter();

  const navigateMobileTab = (tab: MobilePrimaryTab): void => {
    if (tab === "map") {
      router.push("/travel-assistant/live-map");
      return;
    }
    const params = new URLSearchParams();
    params.set("mtab", tab);
    router.push(`/travel-assistant?${params.toString()}`);
  };

  return { activeTab, navigateMobileTab };
}

interface MobileTabBarNavProps {
  activeTab: MobilePrimaryTab;
}

export function MobileTabBarNav({ activeTab }: MobileTabBarNavProps) {
  const { navigateMobileTab } = useMobileTabNavigation(activeTab);
  return <MobileTabBar activeTab={activeTab} onSelectTab={navigateMobileTab} />;
}
