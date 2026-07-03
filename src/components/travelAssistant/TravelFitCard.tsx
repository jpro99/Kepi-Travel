"use client";

import { useEffect, useState } from "react";
import { LOCAL_HABITS_DISCLOSURE, loadLocalTravelHabits, saveLocalTravelHabits } from "@/lib/travelAssistant/travelHabitsLocal";
import type { TravelFitReport } from "@/lib/travelFit/types";
import { EarnStackHint } from "@/components/travelAssistant/EarnStackHint";
import type { TravelStyleProfile } from "@/lib/traveler/types";
import { encouragementLine, travelStyleUX } from "@/lib/travelStyle/travelStyleQuiz";

export interface TravelFitReservationInput {
  id: string;
  type: string;
  provider?: string;
  title?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
}

interface TravelFitCardProps {
  userId?: string | null;
  reservations: TravelFitReservationInput[];
  travelStyle?: TravelStyleProfile | null;
}

function confidenceBadge(confidence: TravelFitReport["habits"]["confidence"]): string {
  if (confidence === "strong") return "Knows you well";
  if (confidence === "growing") return "Learning";
  return "Getting started";
}

export function TravelFitCard({ userId, reservations, travelStyle }: TravelFitCardProps) {
  const [report, setReport] = useState<TravelFitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const local = userId ? loadLocalTravelHabits(userId) : null;
        const res = await fetch("/api/travel-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservations }),
        });
        if (!res.ok) throw new Error("Could not load travel fit");
        const data = (await res.json()) as { report: TravelFitReport };
        if (cancelled) return;

        const merged = local?.updatedAt && local.updatedAt > data.report.habits.updatedAt
          ? { ...data.report, habits: { ...data.report.habits, ...local } }
          : data.report;

        setReport(merged);
        if (userId) {
          saveLocalTravelHabits(userId, merged.habits);
          void fetch("/api/travel-habits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged.habits),
          }).catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reservations]);

  if (loading) {
    return <p className="text-sm text-slate-500">Analyzing your travel patterns…</p>;
  }

  if (error || !report) {
    return <p className="text-sm text-red-600">{error ?? "Unavailable"}</p>;
  }

  const ux = travelStyleUX(travelStyle ?? null);
  const topAir = report.airlineFit[0];
  const topHotel = report.hotelFit[0];
  const learningLine =
    ux.detailLevel === "minimal"
      ? report.topRecommendation
      : ux.showEncouragement
        ? `${encouragementLine("trip")} ${report.learningMessage}`
        : report.learningMessage;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#0b1f3a] to-sky-900 px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#f4c95d]">Travel Fit</p>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
            {confidenceBadge(report.habits.confidence)}
          </span>
        </div>
        {ux.showEncouragement ? (
          <p className="mt-2 text-sm font-medium text-[#f4c95d]">{encouragementLine("trip")}</p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-slate-100">{learningLine}</p>
        {ux.detailLevel !== "minimal" ? (
          <p className="mt-3 text-sm font-semibold text-white">{report.topRecommendation}</p>
        ) : null}
      </div>

      {ux.detailLevel !== "minimal" ? (
        <p className="text-[10px] text-slate-500">{LOCAL_HABITS_DISCLOSURE}</p>
      ) : null}

      {report.habits.topAirlines.length > 0 ? (
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Airlines you use</p>
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
            {report.habits.topAirlines.map((a) => `${a.label} (${a.share}%)`).join(" · ")}
          </p>
        </div>
      ) : null}

      {ux.detailLevel === "rich" && topAir ? (
        <div className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
          <p className="text-xs font-bold text-slate-900 dark:text-white">✈️ Best airline fit: {topAir.program}</p>
          <ul className="mt-1 space-y-0.5">
            {topAir.reasons.slice(0, 3).map((r) => (
              <li key={r} className="text-xs text-slate-600 dark:text-slate-300">
                • {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ux.detailLevel !== "minimal" && topHotel ? (
        <div className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
          <p className="text-xs font-bold text-slate-900 dark:text-white">🏨 Best hotel program: {topHotel.program}</p>
          <ul className="mt-1 space-y-0.5">
            {topHotel.reasons.slice(0, 3).map((r) => (
              <li key={r} className="text-xs text-slate-600 dark:text-slate-300">
                • {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(ux.preferChecklists || ux.detailLevel === "rich") &&
        report.statusProjections.map((proj) => (
        <div key={proj.program} className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs font-bold text-amber-900 dark:text-amber-100">{proj.headline}</p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">{proj.detail}</p>
        </div>
      ))}

      <EarnStackHint stack={report.earnStackPreview} />
    </div>
  );
}
