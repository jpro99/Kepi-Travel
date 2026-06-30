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
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-default)] bg-[var(--bg-card)]/95 px-1 pt-0.5 backdrop-blur-xl md:hidden ${className}`}
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        boxShadow: "0 -1px 0 rgba(0,0,0,0.04)",
      }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-0">
        {MOBILE_PRIMARY_TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex min-h-[50px] flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 transition-colors duration-[220ms] ease-in-out ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`font-semibold tracking-tight ${active ? "text-[13px]" : "text-[13px]"}`}>
                {label}
              </span>
              {active ? (
                <span className="h-[2px] w-8 rounded-full bg-[var(--accent)]" />
              ) : (
                <span className="h-[2px] w-8 rounded-full bg-transparent" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
