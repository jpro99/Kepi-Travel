"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFlightSearchPlan,
  defaultSelectableFlightLegIds,
  type FlightSearchPlan,
  type PlannedFlightLeg,
} from "@/lib/travelAssistant/tripPlanBooking";

interface TripFlightLegPickerProps {
  legs: PlannedFlightLeg[];
  tripName?: string | null;
  onSearch: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
}

function roleLabel(role: PlannedFlightLeg["role"]): string {
  if (role === "outbound") return "Fly there";
  if (role === "return") return "Fly home";
  return "Connection";
}

export function TripFlightLegPicker({ legs, tripName, onSearch }: TripFlightLegPickerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => defaultSelectableFlightLegIds(legs));

  useEffect(() => {
    setSelectedIds(defaultSelectableFlightLegIds(legs));
  }, [legs]);

  const selectedLegs = useMemo(
    () => legs.filter((leg) => selectedIds.includes(leg.id)),
    [legs, selectedIds],
  );

  const searchPlan = useMemo(() => buildFlightSearchPlan(selectedLegs), [selectedLegs]);

  if (legs.length === 0) return null;

  const bookedCount = legs.filter((leg) => leg.status === "booked").length;
  const toggle = (leg: PlannedFlightLeg): void => {
    if (leg.status === "booked") return;
    setSelectedIds((prev) =>
      prev.includes(leg.id) ? prev.filter((id) => id !== leg.id) : [...prev, leg.id],
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-[1px] shadow-lg">
      <div className="rounded-[23px] bg-gradient-to-br from-[#071526] via-[#0b2344] to-slate-950 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Flight plan</p>
        <h3 className="mt-1 text-lg font-black text-white">
          {bookedCount === legs.length ? "You're airborne — all set ✈️" : "Pick the flights you want to book"}
        </h3>
        <p className="mt-1 text-xs text-sky-100/75">
          {tripName ? `${tripName} · ` : ""}
          Green checks are already on your trip. Select the rest, then search — we&apos;ll detect round-trip vs multi-city.
        </p>

        <ul className="mt-4 space-y-2">
          {legs.map((leg) => {
            const isBooked = leg.status === "booked";
            const isSelected = isBooked || selectedIds.includes(leg.id);
            return (
              <li key={leg.id}>
                <button
                  type="button"
                  onClick={() => toggle(leg)}
                  disabled={isBooked}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    isBooked
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : isSelected
                        ? "border-sky-300/60 bg-sky-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-black ${
                      isBooked
                        ? "bg-emerald-500 text-white"
                        : isSelected
                          ? "bg-sky-400 text-slate-950"
                          : "border border-white/30 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80">
                        {roleLabel(leg.role)}
                      </span>
                      <span className="text-sm font-black text-white">
                        {leg.fromLabel} → {leg.toLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-sky-100/70">
                      {leg.fromIata} → {leg.toIata} · {leg.departureDate}
                    </span>
                    {isBooked && leg.bookedSummary ? (
                      <span className="mt-1 block text-[10px] font-semibold text-emerald-200">{leg.bookedSummary}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {searchPlan ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80">
              {searchPlan.mode === "roundtrip" ? "Round trip search" : searchPlan.mode === "multi" ? "Multi-city search" : "One-way search"}
            </p>
            <p className="mt-1 text-xs text-white/90">{searchPlan.summary}</p>
            <button
              type="button"
              onClick={() => onSearch(searchPlan, selectedLegs)}
              disabled={selectedLegs.length === 0}
              className="mt-3 w-full rounded-xl bg-[#f4c95d] py-3 text-sm font-black text-slate-900 transition hover:bg-amber-200 disabled:opacity-50"
            >
              Search {selectedLegs.length} flight{selectedLegs.length === 1 ? "" : "s"} →
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-sky-200/70">Select at least one flight to search.</p>
        )}
      </div>
    </div>
  );
}
