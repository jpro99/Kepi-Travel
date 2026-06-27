"use client";

import { useMemo, useState } from "react";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

export interface TripStayPlannerProps {
  segments: TripStaySegment[];
  tripName?: string | null;
  onSearchSegment: (segment: TripStaySegment) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
}

function statusLabel(status: TripStaySegment["status"]): { text: string; className: string } {
  switch (status) {
    case "booked":
      return { text: "Booked", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" };
    case "partial":
      return { text: "Partial", className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" };
    default:
      return { text: "Needs hotel", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" };
  }
}

export function TripStayPlanner({ segments, tripName, onSearchSegment, onAddCityStay }: TripStayPlannerProps) {
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");

  const nextMissing = useMemo(
    () => segments.find((segment) => segment.status === "missing" || segment.status === "partial") ?? null,
    [segments],
  );

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
        Add flights or set trip dates to see where you need hotels — or add a city stay below.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip stay planner</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {tripName?.trim() ? `${tripName.trim()} — ` : ""}
            {segments.length} stop{segments.length === 1 ? "" : "s"}
          </p>
        </div>
        {onAddCityStay ? (
          <button
            type="button"
            onClick={() => setShowAddCity((value) => !value)}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            + City
          </button>
        ) : null}
      </div>

      {nextMissing ? (
        <button
          type="button"
          onClick={() => onSearchSegment(nextMissing)}
          className="w-full rounded-2xl bg-[#0b1f3a] px-4 py-3 text-left text-white shadow-md"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Next up</p>
          <p className="mt-1 text-sm font-bold">{nextMissing.city.split("(")[0]?.trim() || nextMissing.city}</p>
          <p className="text-xs text-slate-300">
            {nextMissing.checkIn} → {nextMissing.checkOut} · {nextMissing.nights} nights · no hotel yet
          </p>
          <p className="mt-2 text-xs font-bold text-[#f4c95d]">Search hotels now →</p>
        </button>
      ) : (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          Every stop on this trip has a hotel — nice work.
        </p>
      )}

      <div className="space-y-2">
        {segments.map((segment, index) => {
          const status = statusLabel(segment.status);
          return (
            <div
              key={segment.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Stay {index + 1} of {segments.length}
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">{segment.city.split("(")[0]?.trim() || segment.city}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {segment.checkIn} → {segment.checkOut} · {segment.nights} night{segment.nights === 1 ? "" : "s"}
                  </p>
                  {segment.reservationTitle ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{segment.reservationTitle}</p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                  {status.text}
                </span>
              </div>
              {segment.status !== "booked" ? (
                <button
                  type="button"
                  onClick={() => onSearchSegment(segment)}
                  className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white"
                >
                  Search this stay
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {showAddCity && onAddCityStay ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Add a city stay</p>
          <input
            type="text"
            value={newCity}
            onChange={(event) => setNewCity(event.target.value)}
            placeholder="Monopoli, Italy"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={newCheckIn}
              onChange={(event) => setNewCheckIn(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            />
            <input
              type="date"
              value={newCheckOut}
              min={newCheckIn}
              onChange={(event) => setNewCheckOut(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <button
            type="button"
            disabled={!newCity.trim() || !newCheckIn || !newCheckOut || newCheckOut <= newCheckIn}
            onClick={() => {
              onAddCityStay({ city: newCity.trim(), checkIn: newCheckIn, checkOut: newCheckOut });
              setNewCity("");
              setNewCheckIn("");
              setNewCheckOut("");
              setShowAddCity(false);
            }}
            className="mt-3 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Add to planner
          </button>
        </div>
      ) : null}
    </div>
  );
}
