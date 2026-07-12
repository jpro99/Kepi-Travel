"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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

function statusLabel(
  segment: TripStaySegment,
  t: (key: string) => string,
): { text: string; className: string } {
  if (segment.status === "booked") {
    return { text: t("statusBooked"), className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" };
  }
  if (segment.status === "partial") {
    return { text: t("statusPartial"), className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" };
  }
  if (segment.stayIntent === "skip" || segment.status === "skipped") {
    return { text: t("statusConnection"), className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  }
  if (segment.needsDecision) {
    return { text: t("statusNeedAnswer"), className: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100" };
  }
  if (segment.stayIntent === "needs_hotel") {
    return { text: t("statusHotelNeeded"), className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" };
  }
  return { text: t("statusReview"), className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
}

function cityName(segment: TripStaySegment): string {
  return segment.city.split("(")[0]?.trim() || segment.city;
}

function isFoldedConnection(segment: TripStaySegment): boolean {
  return (
    segment.stopKind === "connection" &&
    !segment.needsDecision &&
    (segment.stayIntent === "skip" || segment.status === "skipped")
  );
}

export function TripStayPlanner({
  segments,
  tripName,
  usuallySkipsConnections,
  onSearchSegment,
  onAddCityStay,
  onSetStayIntent,
}: TripStayPlannerProps) {
  const t = useTranslations("StayPlanner");
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [busySegmentId, setBusySegmentId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const { mainSegments, foldedConnections } = useMemo(() => {
    const folded = segments.filter(isFoldedConnection);
    const main = segments.filter((segment) => !isFoldedConnection(segment));
    return { mainSegments: main, foldedConnections: folded };
  }, [segments]);

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
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("eyebrow")}</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {tripName?.trim() ? `${tripName.trim()} · ` : ""}
            {t("stopCount", { stops: mainSegments.length })}
          </p>
          {usuallySkipsConnections ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{t("foldHint")}</p>
          ) : null}
        </div>
        {onAddCityStay ? (
          <button
            type="button"
            onClick={() => setShowAddCity((value) => !value)}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            {t("addCity")}
          </button>
        ) : null}
      </div>

      {awaitingDecision.length > 0 ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800 dark:bg-sky-950/30">
          <p className="text-sm font-bold text-sky-900 dark:text-sky-100">
            {t("awaitingPrompt", { count: awaitingDecision.length })}
          </p>
        </div>
      ) : null}

      {nextMissing ? (
        <button
          type="button"
          onClick={() => onSearchSegment(nextMissing)}
          className="w-full rounded-2xl bg-[#0b1f3a] px-4 py-3 text-left text-white shadow-md"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">{t("nextHotelEyebrow")}</p>
          <p className="mt-1 text-sm font-bold">{cityName(nextMissing)}</p>
          <p className="text-xs text-slate-300">
            {nextMissing.checkIn} → {nextMissing.checkOut}
            {nextMissing.nights > 0 ? ` · ${nextMissing.nights} nights` : ""}
          </p>
        </button>
      ) : committedMissing.length === 0 && awaitingDecision.length === 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          {t("staysCovered")}
        </p>
      ) : null}

      <div className="space-y-2">
        {mainSegments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            busy={busySegmentId === segment.id}
            onSearch={() => onSearchSegment(segment)}
            onIntent={onSetStayIntent ? (intent) => void handleIntent(segment, intent) : undefined}
          />
        ))}
      </div>

      {foldedConnections.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => setConnectionsOpen((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                ✈️ {t("connectionsFolded", { count: foldedConnections.length })}
              </p>
              <p className="text-[11px] text-slate-500">
                {foldedConnections.map(cityName).join(" · ")}
              </p>
            </div>
            <span className="text-slate-400">{connectionsOpen ? "▲" : "▼"}</span>
          </button>
          {connectionsOpen ? (
            <div className="space-y-1 border-t border-slate-200 px-4 py-2 dark:border-slate-700">
              {foldedConnections.map((segment) => (
                <div key={segment.id} className="flex items-center justify-between py-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span>{cityName(segment)}</span>
                  <span>
                    {segment.connectionHours != null
                      ? t("layoverHours", { hours: Math.round(segment.connectionHours) })
                      : t("sameDayConnection")}
                  </span>
                  {onSetStayIntent ? (
                    <button
                      type="button"
                      disabled={busySegmentId === segment.id}
                      onClick={() => void handleIntent(segment, "needs_hotel")}
                      className="font-semibold text-sky-700 underline dark:text-sky-300"
                    >
                      {t("needHotel")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showAddCity && onAddCityStay ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("addCityStayTitle")}</p>
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

function SegmentCard({
  segment,
  busy,
  onSearch,
  onIntent,
}: {
  segment: TripStaySegment;
  busy: boolean;
  onSearch: () => void;
  onIntent?: (intent: "needs_hotel" | "skip") => void;
}) {
  const t = useTranslations("StayPlanner");
  const status = statusLabel(segment, (key) => t(key as Parameters<typeof t>[0]));
  const name = cityName(segment);
  const compact = segment.status === "booked" || segment.stayIntent === "skip";

  if (compact && !segment.needsDecision) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
          <p className="text-[11px] text-slate-500">{segment.label}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.text}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">{name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{segment.label}</p>
          {segment.stayIntent === "needs_hotel" && segment.status === "missing" ? (
            <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">Still not booked</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.text}</span>
      </div>

      {segment.needsDecision && onIntent ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onIntent("needs_hotel")}
            className="rounded-xl bg-sky-600 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("yesHotel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onIntent("skip")}
            className="rounded-xl border border-slate-300 py-2 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200 disabled:opacity-50"
          >
            {t("noConnecting")}
          </button>
        </div>
      ) : null}

      {segment.stayIntent === "needs_hotel" && segment.status !== "booked" ? (
        <button type="button" onClick={onSearch} className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white">
          {t("searchHotels")}
        </button>
      ) : null}
    </div>
  );
}
