"use client";

import { useMemo } from "react";
import type { AirportLayout, ComputedRoute, TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { computeRoute } from "@/lib/airportNav/pathfinder";
import type { ArrivalJourneyStop } from "@/lib/airportNav/tripJourney";
import type { DayCoachPathStep } from "@/lib/travelAssistant/airportDayCoach";
import { ArrivalTransportOptionsCard } from "@/components/travelAssistant/ArrivalTransportOptionsCard";
import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";

function chipLabel(stop: ArrivalJourneyStop): string {
  if (stop.role === "passport") return "Passport";
  if (stop.role === "baggage") return "Bags";
  if (stop.role === "customs") return "Customs";
  if (stop.role === "ground_transport") {
    return /leonardo/i.test(stop.label) ? "Leonardo" : stop.label;
  }
  return stop.label;
}

function walkMinutesFromGate(
  layout: AirportLayout,
  fromNodeId: string | null,
  poiId: string | null,
  credentials: TravelerSecurityCredentials,
): number | null {
  if (!fromNodeId || !poiId) return null;
  const route = computeRoute({
    layout,
    fromNodeId,
    toPoiId: poiId,
    credentials,
  });
  if (!route) return null;
  return Math.max(1, Math.round(route.totalSeconds / 60));
}

interface AirportArrivalFirstMileChromeProps {
  layout: AirportLayout;
  arrivalJourney: ArrivalJourneyStop[];
  originNodeId: string | null;
  credentials: TravelerSecurityCredentials;
  pathSteps: DayCoachPathStep[];
  visiblePathSteps: DayCoachPathStep[];
  hiddenCount: number;
  fullDayView: boolean;
  onToggleFullDayView: () => void;
  nextUp: DayCoachPathStep | null;
  selectedPoiId: string | null;
  activeRoute: ComputedRoute | null;
  onPoiClick: (poiId: string) => void;
  bottomInset: string;
  arrivalTransportOptions: ArrivalTransportOption[];
  scheduleNote?: string | null;
  uberUrl?: string | null;
  hotelLabel?: string | null;
}

export function AirportArrivalFirstMileChrome({
  layout,
  arrivalJourney,
  originNodeId,
  credentials,
  pathSteps,
  visiblePathSteps,
  hiddenCount,
  fullDayView,
  onToggleFullDayView,
  nextUp,
  selectedPoiId,
  activeRoute,
  onPoiClick,
  bottomInset,
  arrivalTransportOptions,
  scheduleNote,
  uberUrl,
  hotelLabel,
}: AirportArrivalFirstMileChromeProps) {
  const chipStops = useMemo(
    () =>
      arrivalJourney.filter(
        (stop) =>
          Boolean(stop.poiId)
          && ["passport", "baggage", "customs", "ground_transport"].includes(stop.role),
      ),
    [arrivalJourney],
  );

  const chipMinutes = useMemo(() => {
    const map = new Map<string, number>();
    for (const stop of chipStops) {
      if (!stop.poiId) continue;
      const mins = walkMinutesFromGate(layout, originNodeId, stop.poiId, credentials);
      if (mins != null) map.set(stop.poiId, mins);
    }
    return map;
  }, [chipStops, layout, originNodeId, credentials]);

  const coachBottom = activeRoute
    ? `calc(${bottomInset} + 11.5rem)`
    : `calc(${bottomInset} + 0.5rem)`;

  return (
    <>
      <div
        data-testid="airport-arrival-first-mile-coach"
        className="pointer-events-auto absolute inset-x-3 z-[55] max-h-[38dvh] overflow-y-auto overscroll-contain rounded-2xl border border-sky-400/30 bg-sky-950/88 px-3 py-2.5 shadow-2xl backdrop-blur-md touch-pan-y [-webkit-overflow-scrolling:touch]"
        style={{ bottom: coachBottom }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
            Arrival coach
          </p>
          <button
            type="button"
            data-testid="airport-arrival-day-view-toggle"
            onClick={onToggleFullDayView}
            className="shrink-0 rounded-lg border border-sky-400/30 bg-transparent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200/90 active:opacity-80"
          >
            {fullDayView ? "Coach view" : "Full day view"}
          </button>
        </div>

        {nextUp ? (
          <div className="mt-1.5" data-testid="airport-arrival-next-up">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300/90">Next up</p>
            <p className="text-[15px] font-black leading-tight text-white">{nextUp.text}</p>
            {nextUp.detail ? (
              <p className="mt-0.5 text-[12px] leading-snug text-sky-100/85">{nextUp.detail}</p>
            ) : null}
            {nextUp.minutes != null && nextUp.minutes > 0 ? (
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300/80">
                ~{nextUp.minutes} min walk
              </p>
            ) : null}
          </div>
        ) : null}

        <ol className="mt-2 space-y-1.5">
          {visiblePathSteps.map((step, index) => (
            <li
              key={step.id}
              className={`flex gap-2 rounded-xl px-2.5 py-2 ${
                index === 0 && !fullDayView ? "bg-sky-500/20 ring-1 ring-sky-400/25" : "bg-white/5"
              }`}
            >
              <span className="text-base" aria-hidden>{step.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug text-white">{step.text}</p>
                {step.detail ? (
                  <p className="text-[11px] leading-snug text-sky-100/75">{step.detail}</p>
                ) : null}
                {step.minutes != null && step.minutes > 0 ? (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300/80">
                    ~{step.minutes} min
                  </p>
                ) : null}
              </div>
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-100/85">
              {hiddenCount} more step{hiddenCount === 1 ? "" : "s"} · tap Full day view
            </li>
          ) : null}
        </ol>

        {arrivalTransportOptions.length > 0 ? (
          <div className="mt-2 [&_section]:border-0 [&_section]:bg-transparent [&_section]:px-0 [&_section]:py-0">
            <ArrivalTransportOptionsCard
              options={arrivalTransportOptions}
              uberUrl={uberUrl}
              hotelLabel={hotelLabel}
              scheduleNote={scheduleNote}
            />
          </div>
        ) : null}
      </div>

      <div
        data-testid="airport-arrival-where-to-rail"
        className="pointer-events-auto absolute inset-x-3 z-[60] flex flex-col gap-1"
        style={{ bottom: `calc(${bottomInset} + 0.25rem)` }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80 drop-shadow">
          Where to?
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 touch-pan-x [-webkit-overflow-scrolling:touch]">
          {chipStops.map((stop) => {
            const poiId = stop.poiId!;
            const selected = selectedPoiId === poiId || activeRoute?.toPoiId === poiId;
            const mins = chipMinutes.get(poiId);
            return (
              <button
                key={poiId}
                type="button"
                data-testid={`airport-nav-destination-${poiId}`}
                aria-pressed={selected}
                onClick={() => onPoiClick(poiId)}
                className={`shrink-0 min-h-[48px] rounded-2xl px-3.5 py-2 text-left shadow-lg active:scale-[0.98] ${
                  selected
                    ? "bg-[#f4c95d] text-[#0b1f3a] ring-2 ring-[#f4c95d]/80"
                    : "bg-black/65 text-white ring-1 ring-white/20 backdrop-blur-md"
                }`}
              >
                <span className="block text-[13px] font-bold leading-tight">{chipLabel(stop)}</span>
                {mins != null ? (
                  <span className="mt-0.5 block text-[10px] font-semibold opacity-85">
                    ~{mins} min
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
