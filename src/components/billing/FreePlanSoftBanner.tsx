"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "kepi-free-plan-banner-dismissed";

interface FreePlanSoftBannerProps {
  /** Show only for free (non-Pro / non-lifetime) users. */
  visible: boolean;
  onSeePro: () => void;
}

/**
 * Soft Free→Pro clarity on Home (I41): one trip free; email import + unlimited trips are Pro.
 * Dismissible per browser; does not block the trip.
 */
export function FreePlanSoftBanner({ visible, onSeePro }: FreePlanSoftBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!visible || dismissed) return null;

  return (
    <aside
      className="mb-3 flex items-start gap-3 rounded-2xl border border-[#E5E5EA] bg-white px-4 py-3"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
      aria-label="Free plan"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#1D1D1F]">Free plan · 1 trip</p>
        <p className="mt-0.5 text-[13px] leading-snug text-[#6E6E73]">
          Email import and unlimited trips are on Pro ($9/mo). Forwarding still works on Free.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSeePro}
            className="min-h-[40px] rounded-xl bg-[#007AFF] px-3 text-[14px] font-semibold text-white"
          >
            See Pro
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISS_KEY, "1");
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
            className="min-h-[40px] rounded-xl px-3 text-[14px] font-semibold text-[#007AFF]"
          >
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
