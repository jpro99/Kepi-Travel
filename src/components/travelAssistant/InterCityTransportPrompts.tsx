"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildFlightSearchPlan,
  type FlightSearchPlan,
  type PlannedFlightLeg,
} from "@/lib/travelAssistant/tripPlanBooking";
import {
  interCityTransportQuestion,
  listMissingTransportGaps,
  type InterCityTransportGap,
} from "@/lib/travelAssistant/interCityTransport";
import { suggestInterCityRoute } from "@/lib/travelAssistant/interCityTransportSuggestions";
import {
  quickGroundModeEmoji,
  type QuickGroundMode,
} from "@/lib/travelAssistant/quickGroundTransport";
import { TransportRouteSheet } from "@/components/travelAssistant/TransportRouteSheet";
import { postSuggestionOutcome } from "@/lib/travelAssistant/mlReadiness/clientTelemetry";
import type { TravelStyleMode } from "@/lib/traveler/types";

interface InterCityTransportPromptsProps {
  legs: PlannedFlightLeg[];
  onSearchFlights: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onQuickGroundTransport: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
  travelerType?: TravelStyleMode | null;
}

const QUICK_GROUND_MODES: QuickGroundMode[] = ["uber", "taxi", "metro", "train"];

function roleBadge(role: InterCityTransportGap["role"], t: (key: string) => string): string {
  if (role === "outbound") return t("roleOutbound");
  if (role === "return") return t("roleReturn");
  return t("roleBetween");
}

function quickGroundLabel(mode: QuickGroundMode, t: (key: string) => string): string {
  if (mode === "uber") return t("quickUber");
  if (mode === "taxi") return t("quickTaxi");
  if (mode === "metro") return t("quickMetro");
  return t("quickTrain");
}

export function InterCityTransportPrompts({
  legs,
  onSearchFlights,
  onQuickGroundTransport,
  travelerType = null,
}: InterCityTransportPromptsProps) {
  const t = useTranslations("GroundTransport");
  const gaps = listMissingTransportGaps(legs);
  const [routeGap, setRouteGap] = useState<InterCityTransportGap | null>(null);
  const routeSuggestion = routeGap
    ? suggestInterCityRoute(routeGap.fromLabel, routeGap.toLabel, routeGap.fromIata, routeGap.toIata)
    : null;
  const gapSignature = gaps.map((gap) => gap.id).join("|");
  const searchFlightsVisible = useMemo(
    () =>
      gaps.some((gap) => {
        const suggestion = suggestInterCityRoute(gap.fromLabel, gap.toLabel, gap.fromIata, gap.toIata);
        return !suggestion?.hideFlights;
      }),
    [gaps],
  );

  useEffect(() => {
    if (gaps.length === 0) return;
    const keys = ["see-routes", "ground-uber", "ground-taxi", "ground-metro", "ground-train"];
    if (searchFlightsVisible) keys.push("search-flights");
    for (const suggestionKey of keys) {
      void postSuggestionOutcome({
        surface: "inter-city-transport",
        suggestionKey,
        outcome: "impression",
        travelerType,
        honest: true,
        metadata: { gapCount: gaps.length },
      });
    }
  }, [gapSignature, gaps.length, searchFlightsVisible, travelerType]);

  if (gaps.length === 0) return null;

  const logClick = (suggestionKey: string, extra?: Record<string, string | number | boolean | null>): void => {
    void postSuggestionOutcome({
      surface: "inter-city-transport",
      suggestionKey,
      outcome: "click",
      travelerType,
      honest: true,
      metadata: extra,
    });
  };

  const searchOne = (gap: InterCityTransportGap): void => {
    const plan = buildFlightSearchPlan([gap.leg]);
    if (!plan) return;
    logClick("search-flights", { gapId: gap.id, scope: "one" });
    onSearchFlights(plan, [gap.leg]);
  };

  const searchAll = (): void => {
    const selected = gaps.map((gap) => gap.leg);
    const plan = buildFlightSearchPlan(selected);
    if (!plan) return;
    logClick("search-flights", { scope: "all" });
    onSearchFlights(plan, selected);
  };

  return (
    <>
      <section
        data-testid="inter-city-transport-prompts"
        className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-950/40 dark:via-slate-900 dark:to-sky-950/30"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              {t("missingTransport")}
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{t("transportTitle")}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("transportSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={searchAll}
            className="shrink-0 rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-bold text-sky-800 shadow-sm active:opacity-80 dark:border-sky-600 dark:bg-slate-900 dark:text-sky-200"
          >
            {t("searchAllFlights")}
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {gaps.map((gap) => {
            const suggestion = suggestInterCityRoute(
              gap.fromLabel,
              gap.toLabel,
              gap.fromIata,
              gap.toIata,
            );
            return (
              <li
                key={gap.id}
                className="rounded-2xl border border-amber-200/80 bg-white/90 p-4 dark:border-amber-500/20 dark:bg-slate-900/80"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                    {roleBadge(gap.role, t)}
                  </span>
                  {gap.dateDisplay ? (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{gap.dateDisplay}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-bold leading-snug text-slate-900 dark:text-white">
                  {interCityTransportQuestion(gap)}
                </p>
                {suggestion ? (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {t("distanceMi", { miles: suggestion.distanceMi, hint: suggestion.hint })}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                  {gap.fromLabel} → {gap.toLabel}
                  {gap.fromIata && gap.toIata ? ` · ${gap.fromIata} → ${gap.toIata}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`see-routes-${gap.id}`}
                    onClick={() => {
                      logClick("see-routes", { gapId: gap.id });
                      setRouteGap(gap);
                    }}
                    className="rounded-full bg-[#0F1923] px-4 py-2 text-xs font-bold text-white active:opacity-80 dark:bg-[#f4c95d] dark:text-[#0F1923]"
                  >
                    {t("seeRoutes")}
                  </button>
                  {QUICK_GROUND_MODES.map((mode) => (
                    <button
                      key={`${gap.id}-${mode}`}
                      type="button"
                      data-testid={`quick-ground-${mode}-${gap.id}`}
                      onClick={() => {
                        logClick(`ground-${mode}`, { gapId: gap.id, mode });
                        onQuickGroundTransport(gap, mode);
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm active:opacity-80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {quickGroundModeEmoji(mode)} {quickGroundLabel(mode, t)}
                    </button>
                  ))}
                  {!suggestion?.hideFlights ? (
                    <button
                      type="button"
                      onClick={() => searchOne(gap)}
                      className="rounded-full bg-[#007AFF] px-4 py-2 text-xs font-bold text-white active:opacity-80"
                    >
                      {t("searchFlights")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <TransportRouteSheet
        open={Boolean(routeGap && routeSuggestion)}
        route={routeSuggestion}
        onClose={() => setRouteGap(null)}
        onPickMode={(mode) => {
          if (routeGap) {
            logClick(`ground-${mode}`, { gapId: routeGap.id, mode, via: "route-sheet" });
            onQuickGroundTransport(routeGap, mode);
          }
          setRouteGap(null);
        }}
      />
    </>
  );
}
