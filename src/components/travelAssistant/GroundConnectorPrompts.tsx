"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  detectGroundConnectorGaps,
  type GroundConnectorGap,
} from "@/lib/travelAssistant/groundConnectorGaps";
import { suggestInterCityRoute } from "@/lib/travelAssistant/interCityTransportSuggestions";
import {
  quickGroundModeEmoji,
  type QuickGroundMode,
} from "@/lib/travelAssistant/quickGroundTransport";
import { TransportRouteSheet } from "@/components/travelAssistant/TransportRouteSheet";

interface GroundConnectorReservation {
  id: string;
  type: string;
  localTime: string;
  flightDate?: string;
  flightArrivalAirport?: string;
  flightDepartureAirport?: string;
  location?: string;
  checkOutDate?: string;
  title?: string;
  confirmationCode?: string | null;
}

interface GroundConnectorPromptsProps {
  reservations: GroundConnectorReservation[];
  tripStart?: string | null;
  tripEnd?: string | null;
  onQuickGroundTransport?: (gap: GroundConnectorGap, mode: QuickGroundMode) => void;
  className?: string;
}

const QUICK_GROUND_MODES: QuickGroundMode[] = ["uber", "taxi", "metro", "train"];

function quickGroundLabel(mode: QuickGroundMode): string {
  if (mode === "uber") return "Uber";
  if (mode === "taxi") return "Taxi";
  if (mode === "metro") return "Metro";
  return "Train";
}

function kindBadge(kind: GroundConnectorGap["kind"], t: (key: string) => string): string {
  return kind === "airport_transfer" ? t("airportTransfer") : t("betweenStays");
}

export function GroundConnectorPrompts({
  reservations,
  tripStart,
  tripEnd,
  onQuickGroundTransport,
  className = "",
}: GroundConnectorPromptsProps) {
  const t = useTranslations("GroundTransport");
  const gaps = useMemo(
    () =>
      detectGroundConnectorGaps({
        reservations,
        tripStart,
        tripEnd,
      }),
    [reservations, tripEnd, tripStart],
  );
  const [routeGap, setRouteGap] = useState<GroundConnectorGap | null>(null);
  const routeSuggestion = routeGap
    ? suggestInterCityRoute(routeGap.fromLabel, routeGap.toLabel, routeGap.fromIata, routeGap.toIata)
    : null;

  if (gaps.length === 0) return null;

  return (
    <>
      <section
        data-testid="ground-connector-prompts"
        className={`overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-950/40 dark:via-slate-900 dark:to-sky-950/30 ${className}`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
          {t("eyebrow")}
        </p>
        <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{t("title")}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>

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
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                  {kindBadge(gap.kind, t)}
                </span>
                <p className="mt-2 text-sm font-bold leading-snug text-slate-900 dark:text-white">
                  {gap.detail}
                </p>
                {suggestion ? (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    ~{suggestion.distanceMi} mi · {suggestion.hint}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                  {gap.fromLabel} → {gap.toLabel}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`see-routes-${gap.id}`}
                    onClick={() => setRouteGap(gap)}
                    className="rounded-full bg-[#0F1923] px-4 py-2 text-xs font-bold text-white active:opacity-80 dark:bg-[#f4c95d] dark:text-[#0F1923]"
                  >
                    {t("seeRoutes")}
                  </button>
                  {onQuickGroundTransport
                    ? QUICK_GROUND_MODES.map((mode) => (
                        <button
                          key={`${gap.id}-${mode}`}
                          type="button"
                          onClick={() => onQuickGroundTransport(gap, mode)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm active:opacity-80 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {quickGroundModeEmoji(mode)} {quickGroundLabel(mode)}
                        </button>
                      ))
                    : null}
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
          if (routeGap && onQuickGroundTransport) onQuickGroundTransport(routeGap, mode);
          setRouteGap(null);
        }}
      />
    </>
  );
}
