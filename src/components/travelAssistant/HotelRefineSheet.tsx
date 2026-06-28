"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HotelChainFilterBar } from "@/components/travelAssistant/ChainFilterBar";
import { HotelPriceRangeSlider } from "@/components/travelAssistant/HotelPriceRangeSlider";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import { parseStayProfileText } from "@/lib/hotels/parseStayProfileText";
import type { ChainToggleMap } from "@/lib/loyalty/chainFilterPrefs";
import type { HotelChainId } from "@/lib/loyalty/chainRegistry";

type PayMode = "any" | "cash" | "points";
type SortMode = "browse" | "price" | "rating" | "match" | "points";

interface HotelRefineSheetProps {
  open: boolean;
  onClose: () => void;
  payMode: PayMode;
  onPayModeChange: (mode: PayMode) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  showNearby: boolean;
  onShowNearbyChange: (value: boolean) => void;
  nearbyCount: number;
  chainToggles: ChainToggleMap<HotelChainId>;
  onChainToggle: (id: HotelChainId, enabled: boolean) => void;
  priceMin: number;
  priceMax: number;
  priceBounds: { min: number; max: number };
  onPriceChange: (min: number, max: number) => void;
  onProfileSaved?: (profile: HotelStayProfile) => void;
  onApplyStrictStyle: () => void;
}

export function HotelRefineSheet({
  open,
  onClose,
  payMode,
  onPayModeChange,
  sortMode,
  onSortModeChange,
  showNearby,
  onShowNearbyChange,
  nearbyCount,
  chainToggles,
  onChainToggle,
  priceMin,
  priceMax,
  priceBounds,
  onPriceChange,
  onProfileSaved,
  onApplyStrictStyle,
}: HotelRefineSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [requiresElevator, setRequiresElevator] = useState(false);
  const [prefersNearTransit, setPrefersNearTransit] = useState(false);
  const [prefersOceanView, setPrefersOceanView] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/hotels/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { profile?: HotelStayProfile } | null) => {
        const profile = payload?.profile;
        if (!profile) return;
        setText(profile.freeTextSummary ?? "");
        setRequiresElevator(profile.requiresElevator || profile.avoidStairs);
        setPrefersNearTransit(profile.prefersNearTransit);
        setPrefersOceanView(profile.prefersOceanView);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleApply = async (): Promise<void> => {
    setSaving(true);
    try {
      const parsed = parseStayProfileText(text);
      const response = await fetch("/api/hotels/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeTextSummary: text,
          requiresElevator: requiresElevator || parsed.requiresElevator,
          avoidStairs: requiresElevator || parsed.avoidStairs,
          prefersNearTransit: prefersNearTransit || parsed.prefersNearTransit,
          prefersOceanView: prefersOceanView || parsed.prefersOceanView,
          prefersBreakfast: parsed.prefersBreakfast ?? "dont_care",
          qualityFloor: parsed.qualityFloor ?? "mid",
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { profile?: HotelStayProfile };
        if (payload.profile) onProfileSaved?.(payload.profile);
      }
      onApplyStrictStyle();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <button type="button" aria-label="Close refine" onClick={onClose} className="fixed inset-0 z-[94] bg-slate-950/40" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-3 bottom-3 z-[95] mx-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[#fafafa] shadow-2xl dark:bg-[#0b1f3a] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Refine</h3>
              <p className="mt-1 text-sm text-slate-500">Budget, stay style, chains, and sort.</p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-4">
          <section>
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Pay with</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["any", "Cash + points"],
                  ["cash", "Cash"],
                  ["points", "Points"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    onPayModeChange(mode);
                    if (mode === "points") onSortModeChange("points");
                    else if (sortMode === "points") onSortModeChange("browse");
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    payMode === mode
                      ? "bg-[#f4c95d] text-[#0b1f3a]"
                      : "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Sort by</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["browse", "Browse all"],
                  ["price", "Lowest price"],
                  ["rating", "Top rated"],
                  ["match", "Best match"],
                  ...(payMode === "points" || payMode === "any" ? ([["points", "Best points"]] as const) : []),
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSortModeChange(mode)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    sortMode === mode
                      ? "bg-[#f4c95d] text-[#0b1f3a]"
                      : "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nightly budget</p>
            <HotelPriceRangeSlider
              minBound={priceBounds.min}
              maxBound={priceBounds.max}
              valueMin={priceMin}
              valueMax={priceMax}
              onChange={onPriceChange}
            />
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Stay style</p>
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900/60">
              <input
                type="checkbox"
                checked={requiresElevator}
                onChange={(e) => setRequiresElevator(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-800 dark:text-slate-100">Elevator — no luggage upstairs</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900/60">
              <input
                type="checkbox"
                checked={prefersNearTransit}
                onChange={(e) => setPrefersNearTransit(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-800 dark:text-slate-100">Near train or metro</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900/60">
              <input
                type="checkbox"
                checked={prefersOceanView}
                onChange={(e) => setPrefersOceanView(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-800 dark:text-slate-100">Near the ocean / water</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Example: $100–200/night, elevator only, clean hotels near the train."
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f4c95d] dark:bg-slate-900/60 dark:text-slate-100"
            />
          </section>

          {nearbyCount > 0 ? (
            <button
              type="button"
              onClick={() => onShowNearbyChange(!showNearby)}
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-sm ${
                showNearby
                  ? "bg-[#f4c95d] text-[#0b1f3a]"
                  : "bg-white text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              }`}
            >
              {showNearby ? "Showing nearby areas" : `Include nearby (+${nearbyCount})`}
            </button>
          ) : null}

          <HotelChainFilterBar toggles={chainToggles} onChange={onChainToggle} collapsed={false} />
        </div>

        <div className="px-6 py-5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleApply()}
            className="w-full rounded-2xl bg-[#f4c95d] py-4 text-sm font-black text-[#0b1f3a] disabled:opacity-60"
          >
            {saving ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
