"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface MobileTabBarProps {
  activeTab?: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  className?: string;
}

export function MobileTabBar({ activeTab, onSelectTab, className = "" }: MobileTabBarProps) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const handleSelect = useCallback(
    (tab: MobilePrimaryTab) => {
      onSelectTab(tab);
    },
    [onSelectTab],
  );

  const bar = (
    <nav
      className={`fixed inset-x-0 bottom-0 z-[9999] border-t border-[var(--border-default)] bg-[var(--bg-card)] px-2 pt-1 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl pointer-events-auto ${className}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {MOBILE_PRIMARY_TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(id);
              }}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 transition-colors touch-manipulation select-none ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`font-bold tracking-tight ${active ? "text-[17px]" : "text-[16px]"}`}>
                {label}
              </span>
              {active ? (
                <span className="h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              ) : (
                <span className="h-[3px] w-10 rounded-full bg-transparent" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );

  if (!portalReady) {
    return null;
  }

  return createPortal(bar, document.body);
}
