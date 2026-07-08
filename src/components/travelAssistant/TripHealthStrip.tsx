"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { detectTripGaps, type TripGap, type TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";
import { postSuggestionOutcome } from "@/lib/travelAssistant/mlReadiness/clientTelemetry";

interface TripHealthReservation {
  id: string;
  type: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  checkOutDate?: string;
  confirmationCode?: string;
  notes?: string;
}

interface TripHealthStripProps {
  reservations: TripHealthReservation[];
  missingPriceCount?: number;
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onReviewPricing?: () => void;
  onSkipPreDepartureNight?: (flightDay: string) => void;
  className?: string;
}

interface HealthRow {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  severity: TripGap["severity"];
  actionLabel?: string;
  actionTab?: string;
  actionContext?: TripGap["actionContext"];
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

function groupGaps(
  gaps: TripGap[],
  onSkipPreDepartureNight?: (flightDay: string) => void,
): HealthRow[] {
  const byTitle = new Map<string, TripGap[]>();
  for (const gap of gaps) {
    const list = byTitle.get(gap.title) ?? [];
    list.push(gap);
    byTitle.set(gap.title, list);
  }

  return [...byTitle.entries()].map(([title, items]) => {
    const first = items[0]!;
    const count = items.length;
    const preDepartureMatch = /^no-hotel-night-before-(\d{4}-\d{2}-\d{2})$/u.exec(first.id);
    return {
      id: `gap-group-${first.id}`,
      emoji: first.emoji,
      title: count > 1 ? `${title} (${count})` : title,
      detail:
        count > 1
          ? items.map((item) => item.detail.split(".")[0]).slice(0, 3).join(" · ") +
            (count > 3 ? ` · +${count - 3} more` : "")
          : first.detail,
      severity: items.some((item) => item.severity === "critical")
        ? "critical"
        : items.some((item) => item.severity === "warning")
          ? "warning"
          : first.severity,
      actionLabel: first.actionLabel,
      actionTab: first.actionTab,
      actionContext: first.actionContext,
      secondaryActionLabel:
        preDepartureMatch && onSkipPreDepartureNight ? "Staying at home" : undefined,
      onSecondaryAction:
        preDepartureMatch && onSkipPreDepartureNight
          ? () => onSkipPreDepartureNight(preDepartureMatch[1]!)
          : undefined,
    };
  });
}

const SEVERITY_RING: Record<TripGap["severity"], string> = {
  critical: "border-red-300/80 bg-red-50/90 dark:border-red-500/40 dark:bg-red-950/30",
  warning: "border-amber-300/80 bg-amber-50/90 dark:border-amber-500/40 dark:bg-amber-950/20",
  info: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60",
};

export function TripHealthStrip({
  reservations,
  missingPriceCount = 0,
  stayDecisions,
  onGapActionTap,
  onReviewPricing,
  onSkipPreDepartureNight,
  className = "",
}: TripHealthStripProps) {
  const t = useTranslations("TripHealth");
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const gaps = detectTripGaps(
      reservations.map((reservation) => ({
        ...reservation,
        location: reservation.location ?? "",
      })),
      Date.now(),
      { stayDecisions },
    );
    const gapRows = groupGaps(gaps, onSkipPreDepartureNight);
    const pricingRows: HealthRow[] =
      missingPriceCount > 0
        ? [
            {
              id: "missing-pricing",
              emoji: "💰",
              title: `${missingPriceCount} reservation${missingPriceCount === 1 ? "" : "s"} need pricing`,
              detail: "Log cash or miles so trip spend and award tracking stay accurate.",
              severity: "warning",
              actionLabel: "Review in Book",
              onAction: onReviewPricing,
            },
          ]
        : [];
    return [...pricingRows, ...gapRows];
  }, [missingPriceCount, onReviewPricing, onSkipPreDepartureNight, reservations, stayDecisions]);

  useEffect(() => {
    if (missingPriceCount <= 0) return;
    void postSuggestionOutcome({
      surface: "trip-health-strip",
      suggestionKey: "missing-pricing",
      outcome: "impression",
      metadata: { missingPriceCount },
    });
  }, [missingPriceCount]);

  if (rows.length === 0) return null;

  const topSeverity = rows.some((row) => row.severity === "critical")
    ? "critical"
    : rows.some((row) => row.severity === "warning")
      ? "warning"
      : "info";

  const summary = rows
    .slice(0, 2)
    .map((row) => row.title)
    .join(" · ");

  return (
    <section
      className={`rounded-2xl border px-4 py-3 shadow-sm ${SEVERITY_RING[topSeverity]} ${className}`}
      aria-label="Trip health"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {t("title", { count: rows.length })}
          </p>
          {!expanded ? (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{summary}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {expanded ? t("hide") : t("show")}
        </span>
      </button>

      {expanded ? (
        <ul className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/10">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-950/40">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {row.emoji} {row.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{row.detail}</p>
              {row.actionLabel || row.secondaryActionLabel ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {row.actionLabel ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (row.id === "missing-pricing") {
                          void postSuggestionOutcome({
                            surface: "trip-health-strip",
                            suggestionKey: "missing-pricing",
                            outcome: "click",
                          });
                        }
                        if (row.onAction) {
                          row.onAction();
                          return;
                        }
                        if (row.actionTab) {
                          onGapActionTap?.({
                            tab: row.actionTab,
                            context: row.actionContext,
                          });
                        }
                      }}
                      className="text-xs font-semibold text-[#0b1f3a] underline decoration-[#f4c95d] underline-offset-2 dark:text-[#f4c95d]"
                    >
                      {row.actionLabel}
                    </button>
                  ) : null}
                  {row.secondaryActionLabel ? (
                    <button
                      type="button"
                      onClick={() => row.onSecondaryAction?.()}
                      className="text-xs font-semibold text-slate-600 underline underline-offset-2 dark:text-slate-300"
                    >
                      {row.secondaryActionLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
