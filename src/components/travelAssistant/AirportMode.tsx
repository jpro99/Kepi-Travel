"use client";

import { useEffect, useMemo, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────── */
interface FlightReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightStatus?: string;
}

interface AirportModeProps {
  reservations: FlightReservation[];
  /** Called when user wants to see all reservations */
  onViewReservations?: () => void;
}

/* ─── UTC parse (follows AGENTS.md rule — no new Date(localTimeString)) ── */
function toUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const approxUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!timezone) return approxUtc;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(approxUtc)).map(p => [p.type, p.value]));
    const tzAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return approxUtc - (tzAsUtc - approxUtc);
  } catch { return approxUtc; }
}

function msToHM(ms: number): { h: number; m: number; s: number } {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s };
}

function fmtCountdown(ms: number): string {
  const { h, m, s } = msToHM(ms);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function localDisplay(localTime: string): string {
  const m = /(\d{2}):(\d{2})$/.exec(localTime.trim().slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

/* ─── Boarding phases ────────────────────────────────────────── */
type Phase = "pre-airport" | "head-to-gate" | "boarding" | "final-call" | "departed" | "off";

function getPhase(deptUtcMs: number, nowMs: number): Phase {
  const minUntil = (deptUtcMs - nowMs) / 60_000;
  if (minUntil > 180) return "off"; // >3h away — don't show
  if (minUntil > 90) return "pre-airport";
  if (minUntil > 45) return "head-to-gate";
  if (minUntil > 20) return "boarding";
  if (minUntil > 0) return "final-call";
  if (minUntil > -60) return "departed";
  return "off";
}

const PHASE_CONFIG: Record<Phase, { label: string; icon: string; bg: string; textColor: string }> = {
  "off": { label: "", icon: "", bg: "", textColor: "" },
  "pre-airport": { label: "Head to airport soon", icon: "🏃", bg: "from-sky-600 to-blue-700", textColor: "text-sky-100" },
  "head-to-gate": { label: "Go to your gate now", icon: "🚶", bg: "from-amber-500 to-orange-600", textColor: "text-amber-50" },
  "boarding": { label: "Boarding now", icon: "🛫", bg: "from-emerald-500 to-teal-600", textColor: "text-emerald-50" },
  "final-call": { label: "Final boarding call!", icon: "🚨", bg: "from-red-500 to-red-700", textColor: "text-red-50" },
  "departed": { label: "Flight departed", icon: "✈️", bg: "from-slate-500 to-slate-700", textColor: "text-slate-200" },
};

/* ─── Component ──────────────────────────────────────────────── */
export function AirportMode({ reservations, onViewReservations }: AirportModeProps) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Find the next upcoming flight within 3 hours or recently departed
  const activeFlight = useMemo(() => {
    const flights = reservations.filter(r => r.type === "flight");
    const candidates = flights
      .map(f => ({ f, utcMs: toUtcMs(f.localTime, f.timezone) }))
      .filter(({ utcMs }) => !isNaN(utcMs) && (utcMs - now) / 60_000 < 180 && (now - utcMs) / 60_000 < 60)
      .sort((a, b) => a.utcMs - b.utcMs);
    return candidates[0] ?? null;
  }, [reservations, now]);

  if (!activeFlight) return null;

  const { f, utcMs: deptUtcMs } = activeFlight;
  const phase = getPhase(deptUtcMs, now);
  if (phase === "off") return null;

  const config = PHASE_CONFIG[phase];
  const msUntilDept = deptUtcMs - now;
  const isDelayed = (f.flightDelayMinutes ?? 0) > 0;
  const delayMin = f.flightDelayMinutes ?? 0;

  // "Leave now" trigger: 90 min before departure (head-to-gate phase)
  const showLeaveNow = phase === "head-to-gate";
  const showFinalCall = phase === "final-call";

  return (
    <div className="space-y-3">
      {/* Main airport card */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${config.bg} p-5 shadow-xl shadow-blue-900/30`}>
        {/* Animated pulse for urgent phases */}
        {(showFinalCall) && (
          <div className="absolute inset-0 rounded-3xl bg-white/10 animate-pulse pointer-events-none" />
        )}

        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{config.icon}</span>
              <p className={`text-sm font-bold uppercase tracking-widest ${config.textColor} opacity-80`}>
                Airport Mode
              </p>
            </div>
            <p className="mt-1 text-white text-xl font-bold leading-tight">
              {config.label}
            </p>
          </div>
          {/* Countdown */}
          {phase !== "departed" && (
            <div className="text-right shrink-0">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Departs in</p>
              <p className="text-white text-2xl font-black tabular-nums leading-none mt-0.5">
                {fmtCountdown(msUntilDept)}
              </p>
            </div>
          )}
        </div>

        {/* Flight info strip */}
        <div className="mt-4 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">
                {f.flightAirline ?? f.provider}{f.flightNumber ? ` ${f.flightNumber}` : ""}
              </p>
              <p className={`text-sm mt-0.5 ${config.textColor} opacity-70`}>
                {f.flightDepartureAirport && f.flightArrivalAirport
                  ? `${f.flightDepartureAirport} → ${f.flightArrivalAirport}`
                  : f.title}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-white font-bold text-lg">
                {localDisplay(f.flightDepartureTime ?? f.localTime)}
              </p>
              {isDelayed && (
                <p className="text-amber-300 text-xs font-bold">+{delayMin}m delay</p>
              )}
            </div>
          </div>
        </div>

        {/* Gate + terminal row */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/10 p-2 text-center">
            <p className="text-white/50 text-[9px] font-bold uppercase tracking-wider">Terminal</p>
            <p className="text-white font-bold text-lg leading-tight mt-0.5">
              {f.flightDepartureTerminal ?? "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-2 text-center">
            <p className="text-white/50 text-[9px] font-bold uppercase tracking-wider">Gate</p>
            <p className="text-white font-bold text-lg leading-tight mt-0.5">
              {f.flightDepartureGate ?? "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-2 text-center">
            <p className="text-white/50 text-[9px] font-bold uppercase tracking-wider">Status</p>
            <p className={`font-bold text-sm leading-tight mt-0.5 ${
              f.flightOnTime === false ? "text-amber-300" : "text-emerald-300"
            }`}>
              {f.flightStatus ?? (f.flightOnTime === false ? "Delayed" : "On time")}
            </p>
          </div>
        </div>

        {/* Leave Now banner */}
        {showLeaveNow && (
          <div className="mt-3 rounded-2xl border border-white/20 bg-white/20 backdrop-blur-sm p-3 flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <div>
              <p className="text-white font-bold text-sm">Leave for the airport now</p>
              <p className="text-white/70 text-xs">
                Allow 90 min before departure for check-in and security.
              </p>
            </div>
          </div>
        )}

        {/* Final call pulse message */}
        {showFinalCall && (
          <div className="mt-3 rounded-2xl border border-white/30 bg-white/25 p-3 text-center">
            <p className="text-white font-black text-sm">🚨 Run to your gate!</p>
            <p className="text-white/80 text-xs mt-0.5">Boarding closes very soon.</p>
          </div>
        )}

        {/* Confirmation code */}
        {f.confirmationCode && (
          <p className={`mt-3 text-center text-[11px] font-mono ${config.textColor} opacity-60`}>
            Confirmation: {f.confirmationCode}
          </p>
        )}
      </div>

      {/* Tips row — contextual based on phase */}
      {(phase === "pre-airport" || phase === "head-to-gate") && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Before you go</p>
          {[
            { icon: "🪪", text: "Passport / ID in your carry-on" },
            { icon: "📱", text: "Download boarding pass to phone" },
            { icon: "🔋", text: "Phone fully charged?" },
            { icon: "💊", text: "Medications in personal item" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}

      {onViewReservations && (
        <button
          type="button"
          onClick={onViewReservations}
          className="w-full text-center text-xs text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 py-1 transition"
        >
          View all reservations →
        </button>
      )}
    </div>
  );
}
