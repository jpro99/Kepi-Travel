"use client";

import { useTranslations } from "next-intl";
import { ConsumerTabIcon } from "@/components/travelAssistant/ConsumerTabIcon";
import { CONSUMER_TAB_BAR, type ConsumerTab } from "@/lib/travelAssistant/consumerTabs";

interface ConsumerDesktopTabBarProps {
  activeTab: ConsumerTab;
  onSelectTab: (tab: ConsumerTab) => void;
}

export function ConsumerDesktopTabBar({ activeTab, onSelectTab }: ConsumerDesktopTabBarProps) {
  const t = useTranslations("ConsumerNav");

  return (
    <div className="relative flex items-stretch overflow-x-auto rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900/90 dark:ring-white/[0.08]">
      {CONSUMER_TAB_BAR.map(([tab]) => {
        const label = t(tab);
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={`relative flex min-h-[48px] min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-all ${
              active
                ? "text-[var(--accent)]"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <ConsumerTabIcon tab={tab} className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
            <span
              className={`text-sm font-semibold tracking-tight lg:text-[10px] ${
                active ? "text-[var(--accent)]" : ""
              }`}
            >
              {label}
            </span>
            {active ? (
              <span className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
