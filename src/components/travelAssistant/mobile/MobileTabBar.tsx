"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface MobileTabBarProps {
  activeTab?: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  className?: string;
}

export function MobileTabBar({ activeTab, onSelectTab, className = "" }: MobileTabBarProps) {
  const t = useTranslations("ConsumerNav");
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
      className={`fixed inset-x-0 bottom-0 isolate z-[99999] border-t border-[var(--border-default)] bg-[var(--bg-card)] px-2 pt-2 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl pointer-events-auto ${className}`}
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-0.5">
        {MOBILE_PRIMARY_TABS.map(({ id }) => {
          const active = activeTab === id;
          const label = t(id);
          return (
            <button
              key={id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(id);
              }}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 transition-colors touch-manipulation select-none ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`font-bold tracking-tight ${active ? "text-[16px]" : "text-[15px]"}`}>
                {label}
              </span>
              {active ? (
                <span className="h-[4px] w-11 rounded-full bg-[var(--accent)]" />
              ) : (
                <span className="h-[4px] w-11 rounded-full bg-transparent" />
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
