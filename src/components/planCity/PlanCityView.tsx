"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PlanCityCatalog,
  PlanCityPace,
  PlanCityStop,
  PlanCityWalkGap,
} from "@/lib/planCity/types";
import {
  dwellLabel,
  filterStopsForPace,
  kindLabel,
} from "@/lib/planCity/paceFilter";
import { sourceChipLabel } from "@/lib/planCity/provenance";
import {
  distributeStopsAcrossDates,
  savePlanCityStopsToDayPlan,
} from "@/lib/planCity/saveToDayPlan";
import type { DayPlanRecord } from "@/lib/travelAssistant/itineraryDayPlan";

const PACE_OPTIONS: Array<{ id: PlanCityPace; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Core centro storico" },
  { id: "full", label: "Full day", hint: "Churches, museums, food" },
  { id: "ambitious", label: "Ambitious", hint: "Full catalog" },
];

function formatWalkGap(gap: PlanCityWalkGap | null | undefined): string {
  if (!gap || gap.unavailable || gap.durationSec == null) return "Walk gap unknown";
  const minutes = Math.max(1, Math.round(gap.durationSec / 60));
  const distance =
    gap.distanceM != null ? ` · ${Math.round(gap.distanceM)} m` : "";
  return `~${minutes} min walk${distance}`;
}

interface PlanCityViewProps {
  cityLabel: string;
  catalog: PlanCityCatalog | null;
  catalogLoading?: boolean;
  /** ISO date keys in this city stay — first used as default save target. */
  dateKeys: string[];
  getDayPlan: (dateKey: string, fallbackLocation: string) => DayPlanRecord;
  onSaveDayPlan: (dateKey: string, plan: DayPlanRecord, fallbackLocation: string) => void;
  onClose: () => void;
  onSearchCity?: (query: string) => void;
}

export function PlanCityView({
  cityLabel,
  catalog,
  catalogLoading = false,
  dateKeys,
  getDayPlan,
  onSaveDayPlan,
  onClose,
  onSearchCity,
}: PlanCityViewProps) {
  const [pace, setPace] = useState<PlanCityPace>("easy");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [myDayOrder, setMyDayOrder] = useState<string[]>([]);
  const [walkGaps, setWalkGaps] = useState<Record<string, PlanCityWalkGap>>({});
  const [saveDateKey, setSaveDateKey] = useState(dateKeys[0] ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  useEffect(() => {
    if (dateKeys[0]) setSaveDateKey(dateKeys[0]);
  }, [dateKeys]);

  const catalogStops = useMemo(() => {
    if (!catalog) return [] as PlanCityStop[];
    return filterStopsForPace(catalog.stops, pace);
  }, [catalog, pace]);

  const stopById = useMemo(() => {
    const map = new Map<string, PlanCityStop>();
    for (const stop of catalog?.stops ?? []) map.set(stop.id, stop);
    return map;
  }, [catalog]);

  const myDayStops = useMemo(
    () =>
      myDayOrder
        .map((id) => stopById.get(id))
        .filter((stop): stop is PlanCityStop => Boolean(stop)),
    [myDayOrder, stopById],
  );

  const toggleStop = (stopId: string): void => {
    setChecked((prev) => {
      const next = { ...prev, [stopId]: !prev[stopId] };
      if (next[stopId]) {
        setMyDayOrder((order) => (order.includes(stopId) ? order : [...order, stopId]));
      } else {
        setMyDayOrder((order) => order.filter((id) => id !== stopId));
      }
      return next;
    });
  };

  const fetchWalkGaps = useCallback(async (orderedIds: string[]): Promise<void> => {
    const next: Record<string, PlanCityWalkGap> = {};
    for (let i = 1; i < orderedIds.length; i += 1) {
      const from = stopById.get(orderedIds[i - 1]!);
      const to = stopById.get(orderedIds[i]!);
      if (!from || !to) continue;
      try {
        const res = await fetch("/api/plan-city/walk-gap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { lat: from.lat, lng: from.lng },
            to: { lat: to.lat, lng: to.lng },
            fromStopId: from.id,
            toStopId: to.id,
          }),
        });
        if (!res.ok) continue;
        const gap = (await res.json()) as PlanCityWalkGap;
        next[`${from.id}->${to.id}`] = gap;
      } catch {
        next[`${from.id}->${to.id}`] = {
          fromStopId: from.id,
          toStopId: to.id,
          distanceM: null,
          durationSec: null,
          routingSource: "none",
          unavailable: true,
        };
      }
    }
    setWalkGaps(next);
  }, [stopById]);

  useEffect(() => {
    if (myDayOrder.length < 2) {
      setWalkGaps({});
      return;
    }
    void fetchWalkGaps(myDayOrder);
  }, [fetchWalkGaps, myDayOrder]);

  const moveStop = (stopId: string, direction: -1 | 1): void => {
    setMyDayOrder((order) => {
      const index = order.indexOf(stopId);
      if (index < 0) return order;
      const target = index + direction;
      if (target < 0 || target >= order.length) return order;
      const next = [...order];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const handleSave = (): void => {
    if (myDayStops.length === 0 || !saveDateKey) return;
    const heading = `${PACE_OPTIONS.find((p) => p.id === pace)?.label ?? pace} · ${cityLabel.split(",")[0]?.trim() ?? cityLabel}`;

    if (dateKeys.length > 1 && myDayStops.length > 1) {
      const spread = distributeStopsAcrossDates(dateKeys, myDayStops);
      for (const chunk of spread) {
        const existing = getDayPlan(chunk.dateKey, cityLabel);
        const { plan } = savePlanCityStopsToDayPlan({
          existingPlan: existing,
          cityLabel,
          selectedStops: chunk.stops,
          dayHeading: heading,
        });
        onSaveDayPlan(chunk.dateKey, plan, cityLabel);
      }
    } else {
      const existing = getDayPlan(saveDateKey, cityLabel);
      const { plan } = savePlanCityStopsToDayPlan({
        existingPlan: existing,
        cityLabel,
        selectedStops: myDayStops,
        dayHeading: heading,
      });
      onSaveDayPlan(saveDateKey, plan, cityLabel);
    }

    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-[#FAF6EF]"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-city-title"
      data-testid="plan-city-view"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E8E0D4] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6E6E73]">
            Plan City
          </p>
          <h1 id="plan-city-title" className="truncate text-[22px] font-bold text-[#1D1D1F]">
            {cityLabel}
          </h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] shrink-0 rounded-full px-4 text-[16px] font-semibold text-[#007AFF]"
        >
          Done
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
        {onSearchCity ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={citySearch}
              onChange={(event) => setCitySearch(event.target.value)}
              placeholder="Search any city on your trip"
              className="min-h-[48px] min-w-[200px] flex-1 rounded-2xl border border-[#E8E0D4] bg-white px-4 text-[17px] text-[#1D1D1F] outline-none"
            />
            <button
              type="button"
              disabled={!citySearch.trim()}
              onClick={() => onSearchCity(citySearch.trim())}
              className="min-h-[48px] rounded-2xl bg-[#007AFF] px-4 text-[16px] font-semibold text-white disabled:opacity-40"
            >
              Go
            </button>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {PACE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPace(option.id)}
              className={`min-h-[48px] rounded-full px-4 text-[15px] font-semibold ${
                pace === option.id
                  ? "bg-[#1D1D1F] text-white"
                  : "bg-white text-[#1D1D1F] ring-1 ring-[#E8E0D4]"
              }`}
            >
              {option.label}
              <span className="ml-1 text-[13px] font-normal opacity-80">· {option.hint}</span>
            </button>
          ))}
        </div>

        {catalogLoading ? (
          <p className="text-[17px] text-[#6E6E73]">Loading stop catalog…</p>
        ) : null}

        {!catalogLoading && !catalog ? (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E8E0D4]">
            <p className="text-[17px] text-[#1D1D1F]">
              No sourced stop catalog for {cityLabel} yet. Lecce is the lab city — other stay cities
              will fill in as Facts run.
            </p>
          </div>
        ) : null}

        {catalog ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[20px] font-bold text-[#1D1D1F]">Stop catalog</h2>
              <p className="mb-3 text-[15px] text-[#6E6E73]">
                Every stop has provenance. Dwell stays unknown when sources don&apos;t publish it.
              </p>
              <ul className="space-y-2">
                {catalogStops.map((stop) => (
                  <li
                    key={stop.id}
                    className="rounded-2xl bg-white px-3 py-3 ring-1 ring-[#E8E0D4]"
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(checked[stop.id])}
                        onChange={() => toggleStop(stop.id)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#007AFF]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold text-[#1D1D1F]">
                          {stop.name}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2 text-[13px] text-[#6E6E73]">
                          <span className="rounded-full bg-[#F2F2F7] px-2 py-0.5">
                            {kindLabel(stop.kind)}
                          </span>
                          <span className="rounded-full bg-[#F2F2F7] px-2 py-0.5">
                            {dwellLabel(stop.dwell)}
                          </span>
                          <span className="rounded-full bg-[#E8F4FF] px-2 py-0.5 text-[#007AFF]">
                            {sourceChipLabel(stop.source.kind)}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-2 text-[20px] font-bold text-[#1D1D1F]">My day</h2>
              {myDayStops.length === 0 ? (
                <p className="text-[16px] italic text-[#8E8E93]">
                  Check stops from the catalog — nothing invented.
                </p>
              ) : (
                <ol className="space-y-2">
                  {myDayStops.map((stop, index) => {
                    const prev = index > 0 ? myDayStops[index - 1] : null;
                    const gapKey = prev ? `${prev.id}->${stop.id}` : null;
                    const gap = gapKey ? walkGaps[gapKey] : null;
                    return (
                      <li
                        key={stop.id}
                        className="rounded-2xl bg-white px-3 py-3 ring-1 ring-[#E8E0D4]"
                      >
                        {gap ? (
                          <p className="mb-2 text-[13px] font-medium text-[#6E6E73]">
                            {formatWalkGap(gap)}
                          </p>
                        ) : null}
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-[15px] font-bold text-[#6E6E73]">
                            {index + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] font-semibold text-[#1D1D1F]">{stop.name}</p>
                            <p className="text-[13px] text-[#6E6E73]">
                              {kindLabel(stop.kind)} · {sourceChipLabel(stop.source.kind)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${stop.name} up`}
                              disabled={index === 0}
                              onClick={() => moveStop(stop.id, -1)}
                              className="min-h-[40px] min-w-[40px] rounded-lg bg-[#F2F2F7] text-[#007AFF] disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${stop.name} down`}
                              disabled={index === myDayStops.length - 1}
                              onClick={() => moveStop(stop.id, 1)}
                              className="min-h-[40px] min-w-[40px] rounded-lg bg-[#F2F2F7] text-[#007AFF] disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {dateKeys.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <label className="block text-[15px] font-semibold text-[#1D1D1F]">
                    Save onto trip day
                  </label>
                  <select
                    value={saveDateKey}
                    onChange={(event) => setSaveDateKey(event.target.value)}
                    className="min-h-[48px] w-full rounded-2xl border border-[#E8E0D4] bg-white px-3 text-[17px]"
                  >
                    {dateKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                  {dateKeys.length > 1 && myDayStops.length > 1 ? (
                    <p className="text-[13px] text-[#6E6E73]">
                      Multiple stay days — stops spread across {dateKeys.length} days when you save.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                disabled={myDayStops.length === 0 || !saveDateKey}
                onClick={handleSave}
                className="mt-4 min-h-[52px] w-full rounded-2xl bg-[#007AFF] text-[17px] font-bold text-white disabled:opacity-40"
              >
                Save to Plan
              </button>
              {savedFlash ? (
                <p className="mt-2 text-[15px] font-semibold text-[#34C759]">Saved on your trip Plan.</p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
