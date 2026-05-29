"use client";

import { useMemo, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────── */
interface ArrivalReservation {
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
  flightArrivalAirport?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightArrivalTime?: string;
  flightStatus?: string;
}

interface ArrivalModeProps {
  reservations: ArrivalReservation[];
  /** Called when user wants to see all reservations */
  onViewReservations?: () => void;
}

/* ─── UTC parse (AGENTS.md rule) ─────────────────────────────── */
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

function localDisplay(localTime: string): string {
  const m = /(\d{2}):(\d{2})$/.exec(localTime.trim().slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

/* ─── US Airports for customs detection ─────────────────────── */
const US_POE = new Set([
  "ATL","BOS","BWI","CLT","DFW","DEN","DTW","EWR","FLL","HNL",
  "IAD","IAH","JFK","LAX","LAS","MCO","MDW","MIA","MSP","ORD",
  "PDX","PHL","PHX","SEA","SFO","SJC","SLC","SNA","STL","TPA","YVR","YYZ"
]);

function isInternationalArrival(arrAirport?: string): boolean {
  // Simple heuristic: if the airport is known US POE, we may need customs
  // Real logic would compare departure vs arrival country — this is a good-faith approximation
  return Boolean(arrAirport && US_POE.has(arrAirport.toUpperCase()));
}

/* ─── Checklist items ────────────────────────────────────────── */
interface CheckItem { id: string; label: string; icon: string; detail?: string; }

function getArrivalChecklist(intl: boolean, hasHotel: boolean, hasRide: boolean): CheckItem[] {
  const items: CheckItem[] = [];
  if (intl) {
    items.push(
      { id: "customs", label: "Clear customs & immigration", icon: "🛂", detail: "Have passport and landing card ready" },
      { id: "ge", label: "Global Entry / Mobile Passport", icon: "🏃", detail: "Use kiosk or Mobile Passport app to skip the line" },
      { id: "declare", label: "Customs declaration ready", icon: "📄", detail: "Food, agriculture items, and anything over duty-free limits" },
    );
  }
  items.push(
    { id: "bags", label: "Check baggage claim belt", icon: "🎡", detail: "Check arrival board for your belt number" },
    { id: "phone", label: "Turn off airplane mode", icon: "📱", detail: "Check for messages while you wait for bags" },
    { id: "power", label: "Grab power bank if needed", icon: "🔋" },
  );
  if (hasHotel) {
    items.push(
      { id: "hotel", label: "Confirm hotel reservation", icon: "🏨", detail: "Have confirmation code ready at check-in" },
    );
  }
  if (hasRide) {
    items.push(
      { id: "ride", label: "Book or confirm your transfer", icon: "🚕", detail: "Many airports have dedicated rideshare pickup zones" },
    );
  }
  items.push(
    { id: "cash", label: "Local currency / card", icon: "💳", detail: "ATM at baggage claim is usually safest option" },
    { id: "sim", label: "Local SIM / data plan check", icon: "📶", detail: "Confirm roaming is on or buy a local SIM" },
  );
  return items;
}

/* ─── Component ──────────────────────────────────────────────── */
export function ArrivalMode({ reservations, onViewReservations }: ArrivalModeProps) {
  const now = Date.now();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Find flight that landed recently (within 2h) or lands within 30 min
  const arrivingFlight = useMemo(() => {
    const flights = reservations.filter(r => r.type === "flight");
    const candidates = flights
      .map(f => {
        // Use arrivalTime field if available, else parse localTime + ~2h estimate
        const arrTime = f.flightArrivalTime ?? f.localTime;
        return { f, utcMs: toUtcMs(arrTime, f.timezone) };
      })
      .filter(({ utcMs }) => !isNaN(utcMs) && (now - utcMs) < 2 * 3600_000 && (utcMs - now) < 30 * 60_000)
      .sort((a, b) => a.utcMs - b.utcMs);
    return candidates[0] ?? null;
  }, [reservations, now]);

  // Find the next hotel check-in
  const nextHotel = useMemo(() => {
    return reservations.find(r => r.type === "hotel") ?? null;
  }, [reservations]);

  // Find next ride reservation
  const nextRide = useMemo(() => {
    return reservations.find(r => r.type === "ride") ?? null;
  }, [reservations]);

  if (!arrivingFlight) return null;

  const { f } = arrivingFlight;
  const intl = isInternationalArrival(f.flightArrivalAirport);
  const checklist = getArrivalChecklist(intl, Boolean(nextHotel), Boolean(nextRide));
  const checkedCount = checklist.filter(it => checked.has(it.id)).length;

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-600 p-5 shadow-xl shadow-blue-900/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛬</span>
              <p className="text-sky-100 text-sm font-bold uppercase tracking-widest opacity-80">
                Arrival Mode
              </p>
            </div>
            <p className="mt-1 text-white text-xl font-bold leading-tight">
              Welcome to {f.flightArrivalAirport ?? "your destination"}
            </p>
          </div>
          <div className="text-right shrink-0">
            {f.flightArrivalTime && (
              <>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Arrived</p>
                <p className="text-white text-xl font-black tabular-nums leading-none mt-0.5">
                  {localDisplay(f.flightArrivalTime)}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Flight strip */}
        <div className="mt-4 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">
                {f.flightAirline ?? f.provider}{f.flightNumber ? ` ${f.flightNumber}` : ""}
              </p>
              <p className="text-sky-100 text-sm mt-0.5 opacity-70">{f.title}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {f.flightArrivalTerminal && (
                <div className="rounded-xl bg-white/10 px-3 py-1.5 text-center">
                  <p className="text-white/50 text-[9px] font-bold uppercase">Terminal</p>
                  <p className="text-white font-bold text-base leading-none mt-0.5">{f.flightArrivalTerminal}</p>
                </div>
              )}
              {f.flightArrivalGate && (
                <div className="rounded-xl bg-white/10 px-3 py-1.5 text-center">
                  <p className="text-white/50 text-[9px] font-bold uppercase">Gate</p>
                  <p className="text-white font-bold text-base leading-none mt-0.5">{f.flightArrivalGate}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* International notice */}
        {intl && (
          <div className="mt-3 rounded-2xl border border-white/20 bg-white/15 p-3 flex items-start gap-2">
            <span className="text-lg shrink-0">🛂</span>
            <div>
              <p className="text-white font-bold text-sm">International arrival</p>
              <p className="text-white/70 text-xs mt-0.5">
                Have your passport ready. Use Global Entry kiosk or Mobile Passport app to clear customs faster.
              </p>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{ width: checklist.length > 0 ? `${(checkedCount / checklist.length) * 100}%` : "0%" }}
            />
          </div>
          <p className="text-white/60 text-xs font-semibold shrink-0">{checkedCount}/{checklist.length}</p>
        </div>
      </div>

      {/* Arrival checklist */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            Arrival checklist
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {checkedCount === checklist.length && checkedCount > 0
              ? "✅ All done — enjoy your trip!"
              : `${checklist.length - checkedCount} steps remaining`}
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {checklist.map(item => {
            const done = checked.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleCheck(item.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all ${
                  done ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {/* Checkbox */}
                <div className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                  done ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"
                }`}>
                  {done && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                {/* Icon + label */}
                <span className="text-base shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                    {item.label}
                  </p>
                  {item.detail && !done && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next hotel card */}
      {nextHotel && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏨</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {nextHotel.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Check-in {localDisplay(nextHotel.localTime)}
                {nextHotel.confirmationCode ? ` · ${nextHotel.confirmationCode}` : ""}
              </p>
              {nextHotel.location && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">📍 {nextHotel.location}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Next ride card */}
      {nextRide && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚕</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {nextRide.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {nextRide.provider}{nextRide.confirmationCode ? ` · ${nextRide.confirmationCode}` : ""}
              </p>
              {nextRide.location && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">📍 {nextRide.location}</p>
              )}
            </div>
          </div>
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
