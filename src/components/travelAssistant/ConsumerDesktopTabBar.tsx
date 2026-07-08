"use client";

import { useTranslations } from "next-intl";
import { CONSUMER_TAB_BAR, type ConsumerTab } from "@/lib/travelAssistant/consumerTabs";

interface ConsumerDesktopTabBarProps {
  activeTab: ConsumerTab;
  onSelectTab: (tab: ConsumerTab) => void;
  onMapTab?: () => void;
}

export function ConsumerDesktopTabBar({ activeTab, onSelectTab, onMapTab }: ConsumerDesktopTabBarProps) {
  const t = useTranslations("ConsumerNav");

  return (
    <div className="relative flex items-stretch overflow-x-auto rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900/90 dark:ring-white/[0.08]">
      {CONSUMER_TAB_BAR.map(([tab, , icon]) => {
        const label = t(tab);
        return (
          <button
            key={tab}
            type="button"
            onClick={() => {
              if (tab === "map") {
                onMapTab?.();
                return;
              }
              onSelectTab(tab);
            }}
            className={`relative flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-all ${
              activeTab === tab
                ? "text-[#007AFF] dark:text-[#0A84FF]"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <span className="text-[15px] leading-none">{icon}</span>
            <span
              className={`text-sm font-semibold tracking-tight lg:text-[10px] ${
                activeTab === tab ? "text-[#007AFF] dark:text-[#0A84FF]" : ""
              }`}
            >
              {label}
            </span>
            {activeTab === tab ? (
              <span className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-full bg-[#007AFF] dark:bg-[#0A84FF]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
