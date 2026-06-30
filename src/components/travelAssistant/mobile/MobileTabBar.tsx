"use client";

import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface MobileTabBarProps {
  activeTab?: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  className?: string;
}

export function MobileTabBar({ activeTab, onSelectTab, className = "" }: MobileTabBarProps) {
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-default)] bg-[var(--bg-card)]/95 px-2 pt-1 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden ${className}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5">
        {MOBILE_PRIMARY_TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 transition-colors ${
                active
                  ? "text-[#007AFF]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`font-bold tracking-tight ${active ? "text-[17px]" : "text-[16px]"}`}>
                {label}
              </span>
              {active ? (
                <span className="h-[3px] w-10 rounded-full bg-[#007AFF]" />
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
