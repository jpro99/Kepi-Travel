"use client";

import { useState, useMemo } from "react";

interface Reservation {
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
  flightDate?: string;
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
  notes?: string;
}

interface FlightsTabProps {
  reservations: Reservation[];
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

function fmt12(iso: string): string {
  const m = /(\d{2}):(\d{2})/.exec(iso?.slice(0, 16) ?? "");
  if (!m) return "";
  const h = +m[1]; const min = m[2];
  return `${h % 12 || 12}:${min} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtDate(localTime: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime ?? "");
  if (!m) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function isCompleted(r: Reservation): boolean {
  const t = (r.flightDepartureTime ?? r.localTime ?? "").slice(0, 16);
  const ms = Date.parse(t.replace(" ", "T"));
  return !isNaN(ms) && Date.now() - ms > 4 * 3600_000;
}

function statusBadge(r: Reservation) {
  const s = (r.flightStatus ?? "").toLowerCase();
  const delay = r.flightDelayMinutes ?? 0;
  if (s === "cancelled") return { label: "CANCELLED", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" };
  if (delay > 0 || s === "delayed") return { label: `+${delay || "?"}m DELAY`, color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" };
  if (r.flightOnTime === true || s === "scheduled" || s === "active") return { label: "ON TIME", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" };
  return null;
}

export function FlightsTab({ reservations, onReservationTap, onCheckStatus, onDelete, onAdd }: FlightsTabProps) {
  const [showPast, setShowPast] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => ({
    upcoming: reservations.filter(r => !isCompleted(r)),
    past: reservations.filter(r => isCompleted(r)),
  }), [reservations]);

  const shown = showPast ? [...upcoming, ...past] : upcoming;

  return (
    <section className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Flights</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {upcoming.length} upcoming{past.length > 0 ? ` · ${past.length} past` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-sm active:opacity-80 transition-opacity"
        >
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {/* Empty state */}
      {shown.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-4xl mb-3">🛫</p>
          <p className="font-semibold text-slate-900 dark:text-white">No flights yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Forward a confirmation email or add manually
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Add flight
          </button>
        </div>
      )}

      {/* Flight cards */}
      <div className="space-y-3">
        {shown.map(r => {
          const dep = r.flightDepartureAirport ?? r.location?.split(" ")?.[0] ?? "---";
          const arr = r.flightArrivalAirport ?? "---";
          const depTime = fmt12(r.flightDepartureTime ?? r.localTime ?? "");
          const arrTime = fmt12(r.flightArrivalTime ?? "");
          const date = fmtDate(r.flightDate ? r.flightDate + " 00:00" : r.localTime ?? "");
          const past = isCompleted(r);
          const badge = statusBadge(r);
          const isOpen = expanded === r.id;

          return (
            <div
              key={r.id}
              className={`overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 transition-all ${
                past ? "ring-slate-100 dark:ring-slate-800 opacity-60" : "ring-black/[0.06] dark:ring-white/[0.08]"
              }`}
            >
              {/* Boarding pass top — tap to expand */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full text-left"
              >
                {/* Airline strip */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {r.flightAirline ?? r.provider}
                    </span>
                    {r.flightNumber && (
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {r.flightNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {badge && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="text-slate-300 dark:text-slate-600 text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Route row */}
                <div className="flex items-center px-5 pb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{dep}</p>
                    <p className="text-base font-semibold text-slate-900 dark:text-white mt-1">{depTime}</p>
                  </div>

                  <div className="flex flex-col items-center gap-1 shrink-0 px-2">
                    <div className="flex items-center gap-1">
                      <div className="h-px w-8 bg-slate-300 dark:bg-slate-600" />
                      <span className="text-slate-400 dark:text-slate-500 text-sm">✈</span>
                      <div className="h-px w-8 bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{date}</p>
                  </div>

                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{arr}</p>
                    <p className="text-base font-semibold text-slate-900 dark:text-white mt-1">{arrTime || "—"}</p>
                  </div>
                </div>
              </button>

              {/* Perforated divider */}
              <div className="flex items-center px-4 py-0">
                <div className="h-4 w-4 rounded-full bg-slate-100 dark:bg-slate-800 -ml-6 shrink-0" />
                <div className="flex-1 border-t-2 border-dashed border-slate-100 dark:border-slate-800 mx-1" />
                <div className="h-4 w-4 rounded-full bg-slate-100 dark:bg-slate-800 -mr-6 shrink-0" />
              </div>

              {/* Bottom details */}
              <div className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="grid grid-cols-3 gap-3 flex-1">
                  {[
                    { label: "TERMINAL", value: r.flightDepartureTerminal || "—" },
                    { label: "GATE", value: r.flightDepartureGate || "—" },
                    { label: "CONF", value: r.confirmationCode?.slice(0, 8) || "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expanded actions */}
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 active:opacity-70"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => onCheckStatus(r.id)}
                    className="flex-1 rounded-xl bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 py-2 text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] active:opacity-70"
                  >
                    Check status
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (window.confirm("Delete this flight?")) onDelete(r.id); }}
                    className="rounded-xl bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 active:opacity-70"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Past flights toggle */}
      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast(v => !v)}
          className="w-full text-center text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] py-2"
        >
          {showPast ? "Hide past flights" : `Show ${past.length} past flight${past.length > 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}
