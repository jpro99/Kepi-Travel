"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ConsumerTabIcon } from "@/components/travelAssistant/ConsumerTabIcon";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

interface MobileTabBarProps {
  activeTab?: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  className?: string;
  /** Hide while full-screen overlays (onboarding, wizard, search) are open. */
  hidden?: boolean;
}

export function MobileTabBar({ activeTab, onSelectTab, className = "", hidden = false }: MobileTabBarProps) {
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
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 gap-0.5">
        {MOBILE_PRIMARY_TABS.map(({ id }) => {
          const active = activeTab === id;
          const labelKey =
            id === "home" ? "trip" : id === "plan" ? "itinerary" : id;
          const label = t(labelKey as "trip");
          return (
            <button
              key={id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(id);
              }}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2.5 transition-colors touch-manipulation select-none ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <ConsumerTabIcon
                tab={id}
                className={active ? "h-[22px] w-[22px]" : "h-5 w-5"}
                strokeWidth={active ? 2.35 : 1.75}
              />
              <span className={`font-semibold leading-none tracking-tight ${active ? "text-[12px]" : "text-[11px]"}`}>
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

  if (!portalReady || hidden) {
    return null;
  }

  return createPortal(bar, document.body);
}
