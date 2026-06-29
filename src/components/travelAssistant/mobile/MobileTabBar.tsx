"use client";

import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface MobileTabBarProps {
  activeTab: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  className?: string;
}

export function MobileTabBar({ activeTab, onSelectTab, className = "" }: MobileTabBarProps) {
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-white/95 px-2 pt-1 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/95 md:hidden ${className}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {MOBILE_PRIMARY_TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 transition-colors ${
                active
                  ? "text-[#007AFF] dark:text-[#0A84FF]"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`text-[15px] font-bold tracking-tight ${active ? "" : "font-semibold"}`}>
                {label}
              </span>
              {active ? (
                <span className="h-[3px] w-10 rounded-full bg-[#007AFF] dark:bg-[#0A84FF]" />
              ) : (
                <span className="h-[3px] w-10 rounded-full bg-transparent" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
