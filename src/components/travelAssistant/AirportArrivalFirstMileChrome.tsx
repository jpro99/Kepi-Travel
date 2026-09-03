"use client";

import { useMemo, useState } from "react";
import { resolvePoiDisplayName } from "@/lib/airportNav/poiDisplayName";
import type { AirportLayout, ComputedRoute } from "@/lib/airportNav/types";
import { computeRoute } from "@/lib/airportNav/pathfinder";
import type { ArrivalJourneyStop } from "@/lib/airportNav/tripJourney";
import type { DayCoachPathStep } from "@/lib/travelAssistant/airportDayCoach";
import { ArrivalTransportOptionsCard } from "@/components/travelAssistant/ArrivalTransportOptionsCard";
import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";

function chipLabel(stop: ArrivalJourneyStop, iata: string, layout: AirportLayout): string {
  if (stop.role === "passport") return "Passport";
  if (stop.role === "baggage") return "Bags";
  if (stop.role === "customs") return "Customs";
  if (stop.role === "ground_transport") {
    if (iata.trim().toUpperCase() === "FCO" && /leonardo/i.test(stop.label)) return "Leonardo";
    if (/termini/i.test(stop.label)) return "Termini";
    const poi = stop.poiId ? layout.pois.find((entry) => entry.id === stop.poiId) : undefined;
    if (poi) return resolvePoiDisplayName(poi, layout);
    return stop.label;
  }
  const poi = stop.poiId ? layout.pois.find((entry) => entry.id === stop.poiId) : undefined;
  if (poi) return resolvePoiDisplayName(poi, layout);
  return stop.label;
}

function walkMinutesFromGate(
  layout: AirportLayout,
  fromNodeId: string | null,
  poiId: string | null,
): number | null {
  if (!fromNodeId || !poiId) return null;
  const route = computeRoute({
    layout,
    fromNodeId,
    toPoiId: poiId,
    credentials: { tsaPreCheck: false, clear: false, known: true },
  });
  if (!route) return null;
  return Math.max(1, Math.round(route.totalSeconds / 60));
}

function fmtWalkMins(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

interface AirportArrivalFirstMileChromeProps {
  layout: AirportLayout;
  arrivalJourney: ArrivalJourneyStop[];
  originNodeId: string | null;
  pathSteps: DayCoachPathStep[];
  visiblePathSteps: DayCoachPathStep[];
  hiddenCount: number;
  fullDayView: boolean;
  onToggleFullDayView: () => void;
  nextUp: DayCoachPathStep | null;
  selectedPoiId: string | null;
  activeRoute: ComputedRoute | null;
  activeDestName: string | null;
  onEndRoute: () => void;
  onPoiClick: (poiId: string) => void;
  bottomInset: string;
  arrivalTransportOptions: ArrivalTransportOption[];
  scheduleNote?: string | null;
  uberUrl?: string | null;
  hotelLabel?: string | null;
  previewMode?: boolean;
  preciseRouteEnabled?: boolean;
  iata: string;
  /** Live map shell: coach opens in a top sheet; destinations live in the side rail. */
  mapFirst?: boolean;
  /** Hide bottom Where-to? chip rail — Live Map uses AirportDestinationRail instead. */
  hideWhereToRail?: boolean;
  /** Top offset for map-first coach chip/sheet (below shell row). */
  chromeTop?: string;
}

export function AirportArrivalFirstMileChrome({
  layout,
  arrivalJourney,
  originNodeId,
  visiblePathSteps,
  hiddenCount,
  fullDayView,
  onToggleFullDayView,
  nextUp,
  selectedPoiId,
  activeRoute,
  activeDestName,
  onEndRoute,
  onPoiClick,
  bottomInset,
  arrivalTransportOptions,
  scheduleNote,
  uberUrl,
  hotelLabel,
  previewMode = false,
  preciseRouteEnabled = false,
  iata,
  mapFirst = false,
  hideWhereToRail = false,
  chromeTop = "0.75rem",
}: AirportArrivalFirstMileChromeProps) {
  const [coachOpen, setCoachOpen] = useState(false);

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
      const mins = walkMinutesFromGate(layout, originNodeId, stop.poiId);
      if (mins != null) map.set(stop.poiId, mins);
    }
    return map;
  }, [chipStops, layout, originNodeId]);

  const chipsBottom = `calc(${bottomInset} + 0.25rem)`;
  const routeSheetBottom = mapFirst
    ? `calc(${bottomInset} + 0.5rem)`
    : activeRoute
      ? `calc(${bottomInset} + 13.5rem)`
      : `calc(${bottomInset} + 5.25rem)`;
  const coachBottom = activeRoute
    ? `calc(${bottomInset} + 13.5rem)`
    : `calc(${bottomInset} + 0.5rem)`;
  const coachSheetTop = `calc(${chromeTop} + 3.25rem)`;
  const coachToggleTop = chromeTop;

  const coachBody = (
    <>
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
        {visiblePathSteps.map((step, index) => {
          const bagsPoiId =
            step.id === "bags"
              ? arrivalJourney.find((stop) => stop.role === "baggage")?.poiId ?? null
              : null;
          const stepBody = (
            <>
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
            </>
          );
          return (
            <li
              key={step.id}
              className={`flex gap-2 rounded-xl px-2.5 py-2 ${
                index === 0 && !fullDayView ? "bg-sky-500/20 ring-1 ring-sky-400/25" : "bg-white/5"
              }`}
            >
              {bagsPoiId ? (
                <button
                  type="button"
                  data-testid="airport-arrival-coach-bags"
                  onClick={() => onPoiClick(bagsPoiId)}
                  className="flex w-full gap-2 text-left active:opacity-90"
                >
                  {stepBody}
                </button>
              ) : (
                <div className="flex gap-2">{stepBody}</div>
              )}
            </li>
          );
        })}
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
    </>
  );

  return (
    <>
      {mapFirst ? (
        coachOpen ? (
          <div
            data-testid="airport-arrival-first-mile-coach"
            className="pointer-events-auto absolute inset-x-3 z-[55] max-h-[28dvh] overflow-y-auto overscroll-contain rounded-2xl border border-sky-400/30 bg-sky-950/92 px-3 py-2.5 shadow-2xl backdrop-blur-md touch-pan-y [-webkit-overflow-scrolling:touch]"
            style={{ top: coachSheetTop }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200/90">
                Arrival steps &amp; rail
              </p>
              <button
                type="button"
                data-testid="airport-arrival-coach-close"
                onClick={() => setCoachOpen(false)}
                className="min-h-[44px] shrink-0 rounded-2xl bg-white/10 px-3 text-[13px] font-bold text-white"
              >
                Close
              </button>
            </div>
            {coachBody}
          </div>
        ) : (
          <button
            type="button"
            data-testid="airport-arrival-coach-open"
            onClick={() => setCoachOpen(true)}
            className="pointer-events-auto absolute left-3 z-[55] min-h-[44px] rounded-full bg-black/60 px-4 py-2.5 text-[13px] font-bold text-white shadow-lg backdrop-blur-md ring-1 ring-white/15 active:scale-[0.98]"
            style={activeRoute ? { top: coachToggleTop } : { bottom: coachBottom }}
          >
            Arrival coach
          </button>
        )
      ) : (
        <div
          data-testid="airport-arrival-first-mile-coach"
          className="pointer-events-auto absolute inset-x-3 z-[55] max-h-[38dvh] overflow-y-auto overscroll-contain rounded-2xl border border-sky-400/30 bg-sky-950/88 px-3 py-2.5 shadow-2xl backdrop-blur-md touch-pan-y [-webkit-overflow-scrolling:touch]"
          style={{ bottom: coachBottom }}
        >
          {coachBody}
        </div>
      )}

      {activeRoute && activeDestName ? (
        <section
          data-testid="airport-nav-route-sheet"
          aria-label="Route instructions"
          className="pointer-events-auto absolute inset-x-3 z-[125] overflow-hidden rounded-[24px] bg-white/95 p-3 pr-16 shadow-2xl backdrop-blur-md dark:bg-slate-900/95 max-h-32"
          style={{ bottom: routeSheetBottom }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {!preciseRouteEnabled ? "Estimated walk" : previewMode ? "Route preview" : "Walking directions"}
              </p>
              <p className="mt-0.5 text-[18px] font-black leading-tight text-slate-900 dark:text-slate-100">
                {activeDestName} · {fmtWalkMins(activeRoute.totalSeconds)}
              </p>
              {!preciseRouteEnabled ? (
                <p className="mt-1 text-[12px] leading-snug text-slate-500">
                  Approximate time from your arrivals gate. Pins are schematic — follow airport signs.
                </p>
              ) : previewMode ? (
                <p className="mt-1 text-[12px] text-slate-500">
                  Live step-by-step guidance starts when you land at {iata}.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onEndRoute}
              className="min-h-[48px] shrink-0 rounded-2xl bg-slate-100 px-3 text-[13px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Close
            </button>
          </div>
        </section>
      ) : null}

      {!hideWhereToRail ? (
        <div
          data-testid="airport-arrival-where-to-rail"
          className="pointer-events-auto absolute inset-x-3 z-[60] flex flex-col gap-1"
          style={{ bottom: chipsBottom }}
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
                  <span className="block text-[13px] font-bold leading-tight">{chipLabel(stop, iata, layout)}</span>
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
      ) : null}
    </>
  );
}
