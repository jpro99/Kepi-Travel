"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BreakfastPreference, HotelQualityFloor, HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import { parseStayProfileText } from "@/lib/hotels/parseStayProfileText";
import { HotelPriceRangeSlider } from "@/components/travelAssistant/HotelPriceRangeSlider";

interface HotelStayPreferencesSheetProps {
  open: boolean;
  onClose: () => void;
  priceMin: number;
  priceMax: number;
  priceBounds: { min: number; max: number };
  onPriceChange: (min: number, max: number) => void;
  onProfileSaved?: (profile: HotelStayProfile) => void;
  hiddenCount?: number;
  onShowHidden?: () => void;
}

export function HotelStayPreferencesSheet({
  open,
  onClose,
  priceMin,
  priceMax,
  priceBounds,
  onPriceChange,
  onProfileSaved,
  hiddenCount = 0,
  onShowHidden,
}: HotelStayPreferencesSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [requiresElevator, setRequiresElevator] = useState(false);
  const [avoidStairs, setAvoidStairs] = useState(false);
  const [prefersNearTransit, setPrefersNearTransit] = useState(false);
  const [prefersOceanView, setPrefersOceanView] = useState(false);
  const [prefersBreakfast, setPrefersBreakfast] = useState<BreakfastPreference>("dont_care");
  const [qualityFloor, setQualityFloor] = useState<HotelQualityFloor>("mid");

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
        setRequiresElevator(profile.requiresElevator);
        setAvoidStairs(profile.avoidStairs);
        setPrefersNearTransit(profile.prefersNearTransit);
        setPrefersOceanView(profile.prefersOceanView);
        setPrefersBreakfast(profile.prefersBreakfast);
        setQualityFloor(profile.qualityFloor);
      })
      .catch(() => {});
  }, [open]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const parsed = parseStayProfileText(text);
      const response = await fetch("/api/hotels/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeTextSummary: text,
          requiresElevator: requiresElevator || parsed.requiresElevator,
          avoidStairs: avoidStairs || parsed.avoidStairs,
          prefersNearTransit: prefersNearTransit || parsed.prefersNearTransit,
          prefersOceanView: prefersOceanView || parsed.prefersOceanView,
          prefersBreakfast: parsed.prefersBreakfast ?? prefersBreakfast,
          qualityFloor: parsed.qualityFloor ?? qualityFloor,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { profile?: HotelStayProfile };
      if (payload.profile) onProfileSaved?.(payload.profile);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <button type="button" aria-label="Close preferences" onClick={onClose} className="fixed inset-0 z-[94] overscroll-contain bg-slate-950/50" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-3 bottom-3 top-auto z-[95] mx-auto max-h-[88dvh] w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Your stay style</p>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Hone your hotel list</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[calc(88dvh-8rem)] space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          <section>
            <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Nightly budget</p>
            <HotelPriceRangeSlider
              minBound={priceBounds.min}
              maxBound={priceBounds.max}
              valueMin={priceMin}
              valueMax={priceMax}
              onChange={onPriceChange}
            />
            <p className="mt-2 text-xs text-slate-500">Only hotels between these prices stay on your list and map.</p>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Must-haves</p>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input type="checkbox" checked={requiresElevator || avoidStairs} onChange={(e) => {
                setRequiresElevator(e.target.checked);
                setAvoidStairs(e.target.checked);
              }} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-800 dark:text-slate-100">Elevator — no dragging luggage upstairs</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input type="checkbox" checked={prefersNearTransit} onChange={(e) => setPrefersNearTransit(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-800 dark:text-slate-100">Near train or metro</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input type="checkbox" checked={prefersOceanView} onChange={(e) => setPrefersOceanView(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-800 dark:text-slate-100">Near the ocean / water</span>
            </label>
          </section>

          <section>
            <label className="mb-1 block text-sm font-bold text-slate-900 dark:text-white">Describe it in your words</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Example: $100–200 per night. No stairs — elevator only. Quality, clean hotels near the train."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </section>

          {hiddenCount > 0 && onShowHidden ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowHidden();
              }}
              className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {hiddenCount} hotel{hiddenCount === 1 ? "" : "s"} hidden — see why →
            </button>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-black text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Apply to this search"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
