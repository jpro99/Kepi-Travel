"use client";

import { useState, useEffect, useCallback } from "react";
import type { DisruptionAssessment, AlternativeFlight, LiveFlightStatus } from "@/lib/flights/disruption";

interface DisruptionAlertProps {
  flightNumber: string;
  airlineIata: string;
  origin: string;
  destination: string;
  scheduledDepart: string;
  scheduledArrive: string;
  nextFlight?: { origin: string; scheduledDepart: string };
}

function fmt(iso: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const SEVERITY_STYLES = {
  none: { bg: "bg-emerald-950/20 border-emerald-500/30", dot: "bg-emerald-500", text: "text-emerald-400" },
  watch: { bg: "bg-blue-950/20 border-blue-500/30", dot: "bg-blue-400", text: "text-blue-300" },
  warning: { bg: "bg-amber-950/20 border-amber-400/40", dot: "bg-amber-400", text: "text-amber-300" },
  critical: { bg: "bg-red-950/30 border-red-500/50", dot: "bg-red-500", text: "text-red-300" },
};

export function DisruptionAlert({
  flightNumber, airlineIata, origin, destination,
  scheduledDepart, scheduledArrive, nextFlight,
}: DisruptionAlertProps) {
  const [assessment, setAssessment] = useState<DisruptionAssessment | null>(null);
  const [status, setStatus] = useState<LiveFlightStatus | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showAlts, setShowAlts] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/disruption/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightNumber, airlineIata, origin, destination, scheduledDepart, scheduledArrive, nextFlight }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAssessment(data.assessment);
      setStatus(data.status);
      setAlternatives(data.alternatives ?? []);
      setLastChecked(new Date());
      if (data.assessment?.actionRequired) setShowAlts(true);
    } catch {
      // Silent fail — don't disrupt the main UI
    } finally {
      setLoading(false);
    }
  }, [flightNumber, airlineIata, origin, destination, scheduledDepart, scheduledArrive, nextFlight]);

  useEffect(() => {
    void check();
    // Poll every 5 minutes
    const interval = setInterval(() => void check(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [check]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-600" />
          <div className="h-3 w-32 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const styles = SEVERITY_STYLES[assessment.severity];

  return (
    <div className={`rounded-2xl border ${styles.bg} overflow-hidden`}>
      {/* Status header */}
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${styles.dot} ${assessment.severity === "critical" ? "animate-pulse" : ""}`} />
            <div>
              <p className={`text-sm font-bold ${styles.text}`}>{assessment.headline}</p>
              <p className="text-xs text-slate-400 mt-0.5">{assessment.detail}</p>
            </div>
          </div>
          <button type="button" onClick={() => void check()}
            className="text-slate-500 text-xs shrink-0 mt-0.5">
            ↻
          </button>
        </div>

        {/* Live status details */}
        {status && (status.gate || status.terminal || status.baggageClaim) && (
          <div className="mt-3 flex gap-4 text-xs">
            {status.terminal && <span className="text-slate-400">Terminal <span className="text-white font-bold">{status.terminal}</span></span>}
            {status.gate && <span className="text-slate-400">Gate <span className="text-white font-bold">{status.gate}</span></span>}
            {status.baggageClaim && <span className="text-slate-400">Claim <span className="text-white font-bold">{status.baggageClaim}</span></span>}
          </div>
        )}

        {/* Updated times */}
        {assessment.delayMinutes > 0 && status?.estimatedDepart && (
          <div className="mt-3 grid grid-cols-2 gap-3 bg-black/20 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold">New departure</p>
              <p className="text-base font-black text-white">{fmt(status.estimatedDepart)}</p>
              <p className="text-[10px] text-slate-500">was {fmt(scheduledDepart)}</p>
            </div>
            {status.estimatedArrive && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">New arrival</p>
                <p className="text-base font-black text-white">{fmt(status.estimatedArrive)}</p>
                <p className="text-[10px] text-slate-500">was {fmt(scheduledArrive)}</p>
              </div>
            )}
          </div>
        )}

        {lastChecked && (
          <p className="text-[10px] text-slate-600 mt-2">
            Updated {lastChecked.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* Alternatives */}
      {assessment.actionRequired && (
        <div className="border-t border-white/5">
          <button type="button" onClick={() => setShowAlts(!showAlts)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm">
            <span className={`font-bold ${styles.text}`}>
              {alternatives.length > 0 ? `${alternatives.length} alternative${alternatives.length !== 1 ? "s" : ""} found` : "Searching alternatives…"}
            </span>
            <span className="text-slate-500">{showAlts ? "▲" : "▼"}</span>
          </button>

          {showAlts && alternatives.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              {alternatives.map((alt, i) => (
                <div key={alt.id || i} className={`rounded-2xl border px-4 py-3.5 ${alt.recommendation === "best" ? "border-emerald-500/40 bg-emerald-950/20" : "border-slate-700 bg-slate-800/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {alt.recommendation === "best" && (
                          <span className="text-[10px] font-black text-emerald-400 uppercase bg-emerald-950/40 px-2 py-0.5 rounded-full">Best option</span>
                        )}
                        <span className="text-xs text-slate-400">{alt.airline} · {alt.stops === 0 ? "Nonstop" : `${alt.stops} stop`}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-black text-white">{fmt(alt.departs)}</span>
                        <span className="text-slate-500">→</span>
                        <span className="font-black text-white">{fmt(alt.arrives)}</span>
                        <span className="text-[10px] text-slate-500">{fmtDate(alt.departs)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{alt.reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-white">${Math.round(alt.price)}</p>
                      <p className="text-[10px] text-slate-500">{alt.currency}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(
                        `/book?from=${alt.origin}&to=${alt.destination}&date=${alt.departs.split("T")[0]}`,
                        "_self"
                      );
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-[#f4c95d] text-[#0b1f3a] text-sm font-black active:opacity-80"
                  >
                    Select this flight →
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAlts && alternatives.length === 0 && (
            <div className="px-4 pb-4">
              <p className="text-xs text-slate-400 text-center py-3">
                No alternatives found in Duffel. Contact the airline directly or check Google Flights.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
