"use client";

import { useMemo, useState } from "react";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { nextMissingStaySegment, segmentsAwaitingDecision, segmentsNeedingHotel } from "@/lib/hotels/deriveTripStaySegments";

export interface TripStayPlannerProps {
  segments: TripStaySegment[];
  tripName?: string | null;
  tripId?: string | null;
  usuallySkipsConnections?: boolean;
  onSearchSegment: (segment: TripStaySegment) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (
    segment: TripStaySegment,
    intent: "needs_hotel" | "skip",
  ) => void | Promise<void>;
}

function statusLabel(segment: TripStaySegment): { text: string; className: string } {
  if (segment.status === "booked") {
    return { text: "Booked", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" };
  }
  if (segment.status === "partial") {
    return { text: "Partial", className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" };
  }
  if (segment.stayIntent === "skip" || segment.status === "skipped") {
    return { text: "No hotel", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  }
  if (segment.needsDecision) {
    return { text: "Need answer", className: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100" };
  }
  if (segment.stayIntent === "needs_hotel") {
    return { text: "Hotel needed", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" };
  }
  return { text: "Review", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
}

function stopKindHint(segment: TripStaySegment): string | null {
  if (segment.stopKind === "connection") {
    return segment.connectionHours != null
      ? `Connection (~${Math.round(segment.connectionHours)}h) — catching another flight`
      : "Connection only — catching another flight";
  }
  if (segment.stopKind === "overnight_layover") return "Overnight layover between flights";
  return null;
}

export function TripStayPlanner({
  segments,
  tripName,
  usuallySkipsConnections,
  onSearchSegment,
  onAddCityStay,
  onSetStayIntent,
}: TripStayPlannerProps) {
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [busySegmentId, setBusySegmentId] = useState<string | null>(null);

  const nextMissing = useMemo(() => nextMissingStaySegment(segments), [segments]);
  const awaitingDecision = useMemo(() => segmentsAwaitingDecision(segments), [segments]);
  const committedMissing = useMemo(() => segmentsNeedingHotel(segments), [segments]);

  const handleIntent = async (segment: TripStaySegment, intent: "needs_hotel" | "skip"): Promise<void> => {
    if (!onSetStayIntent) return;
    setBusySegmentId(segment.id);
    try {
      await onSetStayIntent(segment, intent);
    } finally {
      setBusySegmentId(null);
    }
  };

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
        Add flights or set trip dates to see where you might need hotels — or add a city stay below.
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
          {usuallySkipsConnections ? (
            <p className="mt-0.5 text-[11px] text-slate-500">
              Learned: you usually skip connection cities — we auto-skip same-day hubs unless you say otherwise.
            </p>
          ) : null}
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

      {awaitingDecision.length > 0 ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
          <p className="text-sm font-bold text-sky-900 dark:text-sky-100">
            {awaitingDecision.length} stop{awaitingDecision.length === 1 ? "" : "s"} need a quick answer
          </p>
          <p className="mt-1 text-xs text-sky-800 dark:text-sky-200">
            Do you need a hotel in this city, or are you just connecting?
          </p>
        </div>
      ) : null}

      {nextMissing ? (
        <button
          type="button"
          onClick={() => onSearchSegment(nextMissing)}
          className="w-full rounded-2xl bg-[#0b1f3a] px-4 py-3 text-left text-white shadow-md"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Next up</p>
          <p className="mt-1 text-sm font-bold">{nextMissing.city.split("(")[0]?.trim() || nextMissing.city}</p>
          <p className="text-xs text-slate-300">
            {nextMissing.checkIn} → {nextMissing.checkOut}
            {nextMissing.nights > 0 ? ` · ${nextMissing.nights} nights` : ""} · hotel still needed
          </p>
          <p className="mt-2 text-xs font-bold text-[#f4c95d]">Search hotels now →</p>
        </button>
      ) : committedMissing.length === 0 && awaitingDecision.length === 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          {segments.some((s) => s.stayIntent === "needs_hotel" && s.status === "booked")
            ? "Every city where you need a hotel is covered — nice work."
            : "No open hotel tasks — connections skipped or all set."}
        </p>
      ) : null}

      <div className="space-y-2">
        {segments.map((segment, index) => {
          const status = statusLabel(segment);
          const hint = stopKindHint(segment);
          const cityName = segment.city.split("(")[0]?.trim() || segment.city;
          const isBusy = busySegmentId === segment.id;

          return (
            <div
              key={segment.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Stop {index + 1} of {segments.length}
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">{cityName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{segment.label}</p>
                  {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
                  {segment.intentReason && segment.needsDecision ? (
                    <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">{segment.intentReason}</p>
                  ) : null}
                  {segment.reservationTitle ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{segment.reservationTitle}</p>
                  ) : null}
                  {segment.stayIntent === "needs_hotel" && segment.status === "missing" ? (
                    <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">
                      You said you need a hotel here — still not booked.
                    </p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                  {status.text}
                </span>
              </div>

              {segment.needsDecision && onSetStayIntent ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Need a hotel in {cityName}?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleIntent(segment, "needs_hotel")}
                      className="rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Yes, need hotel
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleIntent(segment, "skip")}
                      className="rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200 disabled:opacity-50"
                    >
                      No, just connecting
                    </button>
                  </div>
                </div>
              ) : null}

              {segment.stayIntent === "needs_hotel" && segment.status !== "booked" ? (
                <button
                  type="button"
                  onClick={() => onSearchSegment(segment)}
                  className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white"
                >
                  Search this stay
                </button>
              ) : null}

              {!segment.needsDecision && segment.stayIntent !== "unknown" && onSetStayIntent ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void handleIntent(segment, segment.stayIntent === "skip" ? "needs_hotel" : "skip")
                  }
                  className="mt-2 text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {segment.stayIntent === "skip" ? "Actually, I do need a hotel" : "Change to connection only"}
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
