"use client";

import { useState, useMemo, useEffect } from "react";
import { buildGateInstructions, getAirportNav, buildArrivalGuide } from "@/lib/travelAssistant/airportNavigation";

/* ─── Types ──────────────────────────────────────────────────── */
interface Reservation {
  id: string; type: string; title: string; provider: string;
  localTime: string; timezone?: string; location: string;
  confirmationCode?: string; notes?: string;
  flightNumber?: string; flightAirline?: string; flightDate?: string;
  flightDepartureAirport?: string; flightArrivalAirport?: string;
  flightDepartureTime?: string; flightArrivalTime?: string;
  flightDepartureGate?: string; flightDepartureTerminal?: string;
  flightArrivalGate?: string; flightArrivalTerminal?: string;
  flightDelayMinutes?: number; flightOnTime?: boolean; flightStatus?: string;
  flightSeatNumber?: string;
}

interface LiveStatusResult {
  flightStatus: string; delayMinutes: number | null;
  departureGate: string; departureTerminal: string;
  arrivalGate: string; arrivalTerminal: string;
  onTime: boolean | null; checkedAt: string;
  busy: boolean; error: string | null;
}

interface FlightsTabProps {
  reservations: Reservation[];
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function fmt12(s: string): string {
  const m = /(\d{2}):(\d{2})/.exec((s ?? "").slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtDate(t: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t ?? "");
  if (!m) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function parseFlightTimeMs(timeStr: string, timezone?: string): number {
  if (!timeStr) return NaN;
  // Normalize to "YYYY-MM-DDTHH:MM" format
  const normalized = timeStr.slice(0, 16).replace(" ", "T");
  if (!normalized.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) return NaN;

  if (timezone) {
    try {
      // Parse as if in the given timezone using Intl
      const [datePart, timePart] = normalized.split("T");
      const [y, mo, d] = (datePart ?? "").split("-").map(Number);
      const [h, mi] = (timePart ?? "").split(":").map(Number);
      const localDate = new Date(y, (mo ?? 1) - 1, d, h ?? 0, mi ?? 0);
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      const parts = Object.fromEntries(fmt.formatToParts(localDate).map(p => [p.type, p.value]));
      const tzDate = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
      return localDate.getTime() - (tzDate.getTime() - localDate.getTime());
    } catch { /* fall through */ }
  }
  // No timezone — treat as UTC to avoid browser-timezone errors
  return Date.parse(normalized + "Z");
}

function isCompleted(r: Reservation): boolean {
  // Use arrival time if available (most accurate signal the flight is done)
  if (r.flightArrivalTime) {
    const arrMs = parseFlightTimeMs(r.flightArrivalTime, r.timezone);
    if (!isNaN(arrMs)) return Date.now() - arrMs > 3600_000; // 1h after arrival
  }
  // Fall back to departure + generous buffer
  // Parse with timezone if available — critical for Japan flights shown in Hawaii time
  const depStr = r.flightDepartureTime ?? r.localTime ?? "";
  const depMs = parseFlightTimeMs(depStr, r.timezone);
  if (!isNaN(depMs)) return Date.now() - depMs > 18 * 3600_000;
  return false;
}

function minsUntilDep(r: Reservation): number {
  const depStr = r.flightDepartureTime ?? r.localTime ?? "";
  const ms = parseFlightTimeMs(depStr, r.timezone);
  return isNaN(ms) ? Infinity : (ms - Date.now()) / 60_000;
}

/* ─── Live status badge ──────────────────────────────────────── */
function StatusBadge({ r, live }: { r: Reservation; live?: LiveStatusResult }) {
  const status = live?.flightStatus || r.flightStatus || "";
  const delay = live?.delayMinutes ?? r.flightDelayMinutes ?? 0;
  const onTime = live?.onTime ?? r.flightOnTime;
  const s = status.toLowerCase();

  if (live?.busy) return (
    <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 animate-pulse">
      Checking…
    </span>
  );
  if (s === "cancelled") return (
    <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-2.5 py-0.5 text-[10px] font-bold">
      CANCELLED
    </span>
  );
  if (delay > 0 || s === "delayed") return (
    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2.5 py-0.5 text-[10px] font-bold">
      +{delay || "?"}m DELAY
    </span>
  );
  if (onTime === true || s === "scheduled" || s === "active" || s === "en-route") return (
    <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-bold">
      ON TIME
    </span>
  );
  return null;
}


/* ─── Arrival guide card — universal, works for all airports ────── */
function ArrivalGuideCard({ flight }: { flight: Reservation }) {
  const [expanded, setExpanded] = useState(false);
  const iata = flight.flightArrivalAirport ?? "";
  if (!iata) return null;

  // Extract 2-letter airline code from flight number (e.g. "AS271" → "AS")
  const airlineCode = flight.flightNumber?.match(/^([A-Z]{2})/)?.[1] ?? "";
  const terminal = flight.flightArrivalTerminal ?? "";

  const guide = buildArrivalGuide(iata, airlineCode, terminal);

  return (
    <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 shadow-xl">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/70">
            Arriving · {iata} · {guide.airportName}
          </p>
          <p className="text-xl font-black text-white mt-0.5">Landing guide</p>
        </div>
        <span className="text-3xl">🛬</span>
      </div>

      {/* Step indicator — baggage → exit → transport */}
      <div className="flex gap-0 mx-4 mb-3">
        {["🧳 Bags", "🚪 Exit", "🚗 Ride"].map((label, i) => (
          <div key={i} className="flex-1 text-center">
            <div className={`h-1 rounded-full mx-0.5 ${i === 0 ? "bg-emerald-400" : "bg-white/20"}`} />
            <p className="text-[9px] text-white/40 mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Baggage claim — always visible */}
      <div className="mx-4 mb-2 rounded-2xl bg-white/10 border border-white/[0.08] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60 mb-2">
          🧳 {guide.baggage.heading}
        </p>
        {guide.baggage.steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 mb-1.5 last:mb-0">
            <span className="text-emerald-400 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-white/90 text-sm leading-snug">{step}</p>
          </div>
        ))}
        <p className="text-emerald-200/40 text-[11px] mt-2">~{guide.baggage.walkMinutes} min from gate to carousel</p>
      </div>

      {/* Exit directions — always visible */}
      <div className="mx-4 mb-2 rounded-2xl bg-white/10 border border-white/[0.08] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60 mb-2">
          🚪 {guide.exit.heading}
        </p>
        {guide.exit.steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 mb-1.5 last:mb-0">
            <span className="text-emerald-400 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-white/90 text-sm leading-snug">{step}</p>
          </div>
        ))}
      </div>

      {/* Rideshare — always visible */}
      <div className="mx-4 mb-2 rounded-2xl bg-white/10 border border-white/[0.08] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60 mb-2">
          🚗 {guide.rideshare.heading}
        </p>
        <p className="text-white/90 text-sm leading-snug">{guide.rideshare.instructions}</p>
      </div>

      {/* Tips — collapsible */}
      {guide.tips.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="w-full px-4 py-2 text-center text-xs font-semibold text-emerald-300/60 hover:text-emerald-200 transition"
          >
            {expanded ? "▲ Hide tips" : `▼ ${guide.tips.length} tip${guide.tips.length > 1 ? "s" : ""} for this airport`}
          </button>
          {expanded && (
            <div className="mx-4 mb-4 rounded-2xl bg-white/[0.06] border border-white/[0.06] px-4 py-3 space-y-2">
              {guide.tips.map((tip, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-emerald-400 shrink-0">💡</span>
                  <p className="text-white/70 text-xs leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!expanded && <div className="pb-1" />}
    </div>
  );
}

/* ─── Airport guide card ─────────────────────────────────────── */
function AirportGuideCard({
  flight, live, locationStatus, onCheckStatus,
}: {
  flight: Reservation;
  live?: LiveStatusResult;
  locationStatus: string;
  onCheckStatus: (id: string) => void;
}) {
  const gate = live?.departureGate || flight.flightDepartureGate || "";
  const terminal = live?.departureTerminal || flight.flightDepartureTerminal || "";
  const iata = flight.flightDepartureAirport ?? "";
  const hasNav = Boolean(iata && getAirportNav(iata));
  const hasGlobalEntry = false; // could be wired from profile later
  const hasPrecheck = false;
  const hasClear = false;

  const { steps, totalMinutes } = useMemo(() =>
    gate && iata
      ? buildGateInstructions(iata, gate, terminal, hasClear, hasPrecheck, hasGlobalEntry)
      : { steps: [], totalMinutes: 0 },
    [gate, terminal, iata]
  );

  // Auto-check on mount — but only if not checked in the last 5 minutes
  // Delayed 3s so navigating quickly between tabs doesn't spam the API
  useEffect(() => {
    const lastChecked = live?.checkedAt ? Date.parse(live.checkedAt) : 0;
    const staleMs = Date.now() - lastChecked;
    const isStale = staleMs > 5 * 60_000; // older than 5 minutes
    if (live?.busy || !isStale) return;
    const timer = setTimeout(() => {
      onCheckStatus(flight.id);
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id]);
  const isAirside = locationStatus === "in-terminal";
  const isAtAirport = locationStatus === "at-airport" || locationStatus === "in-terminal";
  const delay = live?.delayMinutes ?? flight.flightDelayMinutes ?? 0;
  const status = (live?.flightStatus || flight.flightStatus || "").toLowerCase();
  const cancelled = status === "cancelled";

  return (
    <div className={`rounded-3xl overflow-hidden shadow-xl ${cancelled ? "bg-red-950" : "bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900"}`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/70">
            {isAirside ? "You're airside ·" : isAtAirport ? "You're at the airport ·" : "Next flight ·"} {iata} → {flight.flightArrivalAirport ?? ""}
          </p>
          <p className="text-2xl font-black text-white mt-1 leading-tight">
            {flight.flightAirline ?? flight.provider}{flight.flightNumber ? ` ${flight.flightNumber}` : ""}
          </p>
          <p className="text-sky-200/70 text-sm mt-0.5">{fmt12(flight.flightDepartureTime ?? flight.localTime ?? "")} · {fmtDate(flight.flightDate ? flight.flightDate + " 00:00" : flight.localTime ?? "")}</p>
        </div>
        <StatusBadge r={flight} live={live} />
      </div>

      {/* Gate · Terminal · Seat row */}
      <div className="mx-4 mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "GATE", value: gate || "—", highlight: Boolean(gate), loading: live?.busy && !gate },
          { label: "TERMINAL", value: terminal || "—", highlight: Boolean(terminal) },
          { label: "SEAT", value: flight.flightSeatNumber || "—", highlight: Boolean(flight.flightSeatNumber) },
        ].map(({ label, value, highlight, loading }) => (
          <div key={label} className="rounded-2xl bg-white/10 p-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-200/50">{label}</p>
            {loading ? (
              <p className="text-sm text-white/40 animate-pulse mt-1">…</p>
            ) : (
              <p className={`text-xl font-black mt-0.5 ${highlight ? "text-white" : "text-white/30"}`}>{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Delay warning */}
      {delay > 0 && !cancelled && (
        <div className="mx-4 mb-3 rounded-2xl bg-amber-500/20 border border-amber-400/30 px-3 py-2">
          <p className="text-amber-300 text-sm font-bold">⚠️ Delayed {delay} minutes</p>
          <p className="text-amber-200/70 text-xs mt-0.5">New departure around {fmt12((new Date(Date.parse((flight.flightDepartureTime ?? flight.localTime ?? "").replace(" ","T")) + delay * 60_000)).toISOString().replace("T"," "))}</p>
        </div>
      )}

      {/* Step-by-step nav to gate */}
      {isAtAirport && gate && steps.length > 0 && (
        <div className="mx-4 mb-4 rounded-2xl bg-white/8 border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">
              {hasNav ? `Route to Gate ${gate}` : `Getting to Gate ${gate}`}
            </p>
            {totalMinutes > 0 && (
              <span className="text-[10px] text-sky-200/50 font-medium">~{totalMinutes} min</span>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-sm shrink-0 mt-0.5">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/90 text-xs leading-snug">{step.text}</p>
                  {step.detail && <p className="text-white/40 text-[10px] mt-0.5">{step.detail}</p>}
                  {step.minutes > 0 && <p className="text-sky-300/50 text-[10px] mt-0.5">~{step.minutes} min</p>}
                </div>
              </div>
            ))}
          </div>
          {hasNav && (
            <p className="text-[9px] text-white/20 text-center pb-2 px-4">Based on {iata} layout · verify on airport boards</p>
          )}
        </div>
      )}

      {/* No gate yet — prompt check status */}
      {isAtAirport && !gate && (
        <div className="mx-4 mb-4 rounded-2xl bg-white/8 border border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-white/80 text-sm font-semibold">Gate not assigned yet</p>
            <p className="text-white/40 text-xs mt-0.5">Check the boards or tap to get live status</p>
          </div>
          <button
            type="button"
            onClick={() => onCheckStatus(flight.id)}
            disabled={live?.busy}
            className="shrink-0 rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {live?.busy ? "…" : "Check now"}
          </button>
        </div>
      )}

      {/* Refresh button */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => onCheckStatus(flight.id)}
          disabled={live?.busy}
          className="w-full rounded-2xl bg-white/10 border border-white/15 py-2.5 text-xs font-bold text-white/80 hover:bg-white/15 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {live?.busy ? (
            <><span className="animate-spin inline-block">↻</span> Checking live status…</>
          ) : live?.error?.includes("Too many") ? (
            <>↻ Refresh · rate limited — try in a moment</>
          ) : (
            <>↻ Refresh live status{live?.checkedAt
              ? ` · ${new Date(live.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : ""}</>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
export function FlightsTab({
  reservations, liveStatus = {}, locationStatus = "unknown", nearestAirport = "",
  onReservationTap, onCheckStatus, onDelete, onAdd,
}: FlightsTabProps) {
  const [showPast, setShowPast] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Dedup by flightNumber + date, then split upcoming/past
  const { upcoming, past, nextFlight } = useMemo(() => {
    const seen = new Set<string>();
    const deduped = reservations.filter(r => {
      if (!r.flightNumber) return true;
      const key = `${r.flightNumber.replace(/\s+/g,"").toUpperCase()}_${(r.flightDate ?? r.localTime ?? "").slice(0,10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const up = deduped.filter(r => !isCompleted(r));
    const pa = deduped.filter(r => isCompleted(r));
    // Next flight = earliest upcoming by departure time
    const next = [...up].sort((a,b) => minsUntilDep(a) - minsUntilDep(b))[0] ?? null;
    return { upcoming: up, past: pa, nextFlight: next };
  }, [reservations]);

  const shown = showPast ? [...upcoming, ...past] : upcoming;

  // Determine what to show at the top — Apple approach:
  // The app knows where you are in your journey and shows the right card automatically
  const nowMs = Date.now();

  // Are we currently airborne on a flight? (departed, not yet arrived)
  const airborneOnFlight = useMemo(() => [...upcoming, ...past].find(r => {
    const depMs = parseFlightTimeMs(r.flightDepartureTime ?? r.localTime ?? "", r.timezone);
    const arrMs = parseFlightTimeMs(r.flightArrivalTime ?? "", r.timezone);
    return !isNaN(depMs) && nowMs > depMs &&
      (isNaN(arrMs) ? nowMs - depMs < 18 * 3600_000 : nowMs < arrMs + 30 * 60_000);
  }) ?? null, [upcoming, past, nowMs]);

  // Did we just land? (within 2 hours of arrival time)
  const justLanded = useMemo(() => [...upcoming, ...past].find(r => {
    const arrMs = parseFlightTimeMs(r.flightArrivalTime ?? "", r.timezone);
    return !isNaN(arrMs) && nowMs > arrMs && nowMs - arrMs < 2 * 3600_000;
  }) ?? null, [upcoming, past, nowMs]);

  // Show arrival guide when airborne (show destination info) or just landed
  const showArrivalGuide = Boolean(airborneOnFlight ?? justLanded);
  const arrivalFlight = airborneOnFlight ?? justLanded;

  // Show departure guide for the next upcoming (not yet departed) flight
  const showGuide = Boolean(nextFlight) && !airborneOnFlight;

  return (
    <section className="space-y-4 pb-6">
      {/* ── ARRIVAL GUIDE — shown when airborne or just landed ── */}
      {/* Apple: when you're on a plane, show where you're going, not where you left */}
      {showArrivalGuide && arrivalFlight && (
        <ArrivalGuideCard flight={arrivalFlight} />
      )}

      {/* ── DEPARTURE GUIDE — gate/terminal/seat for next flight ── */}
      {showGuide && nextFlight && (
        <AirportGuideCard
          flight={nextFlight}
          live={liveStatus[nextFlight.id]}
          locationStatus={locationStatus}
          onCheckStatus={onCheckStatus}
        />
      )}

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
          className="flex items-center gap-1.5 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-sm active:opacity-80"
        >
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>

      {/* Empty */}
      {shown.length === 0 && !showGuide && (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-4xl mb-3">🛫</p>
          <p className="font-semibold text-slate-900 dark:text-white">No flights yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">Forward a confirmation email or add manually</p>
          <button type="button" onClick={onAdd} className="rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-bold text-white">Add flight</button>
        </div>
      )}

      {/* Flight cards */}
      <div className="space-y-3">
        {shown.map(r => {
          const dep = r.flightDepartureAirport ?? "---";
          const arr = r.flightArrivalAirport ?? "---";
          const live = liveStatus[r.id];
          const gate = live?.departureGate || r.flightDepartureGate || "";
          const terminal = live?.departureTerminal || r.flightDepartureTerminal || "";
          const isPast = isCompleted(r);
          const isOpen = expanded === r.id;
          const isNext = r.id === nextFlight?.id;
          const depTime = fmt12(r.flightDepartureTime ?? r.localTime ?? "");
          const arrTime = fmt12(r.flightArrivalTime ?? "");
          const date = fmtDate(r.flightDate ? r.flightDate + " 00:00" : r.localTime ?? "");

          return (
            <div
              key={r.id}
              className={`overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 transition-all ${
                isPast ? "ring-slate-100 dark:ring-slate-800 opacity-55"
                : isNext && !showGuide ? "ring-[#007AFF]/40 dark:ring-[#0A84FF]/30 shadow-blue-500/10"
                : "ring-black/[0.06] dark:ring-white/[0.08]"
              }`}
            >
              {/* Tap to expand */}
              <button type="button" onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left">
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
                    <StatusBadge r={r} live={live} />
                    <span className="text-slate-300 dark:text-slate-600 text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center px-5 pb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{dep}</p>
                    <p className="text-base font-semibold text-slate-900 dark:text-white mt-1">{depTime}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 px-2">
                    <div className="flex items-center gap-1">
                      <div className="h-px w-8 bg-slate-300 dark:bg-slate-600" />
                      <span className="text-slate-400 text-sm">✈</span>
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
              <div className="grid grid-cols-4 gap-3 px-5 py-3">
                {[
                  { label: "TERMINAL", value: terminal || "—" },
                  { label: "GATE", value: gate || "—", highlight: Boolean(gate) },
                  { label: "SEAT", value: r.flightSeatNumber || "—" },
                  { label: "CONF", value: r.confirmationCode?.slice(0, 7) || "—" },
                ].map(({ label, value, highlight }) => (
                  <div key={label}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${highlight ? "text-[#007AFF] dark:text-[#0A84FF]" : "text-slate-900 dark:text-white"}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Live status error — shown inline, never alarming */}
              {live?.error && !live.busy && (
                <div className="mx-4 mb-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {live.error.includes("Too many") ? "Live status will refresh shortly" : "Couldn't reach status server"}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {live.error.includes("Too many") ? "Check the boards at the airport for gate updates" : "Tap to retry"}
                    </p>
                  </div>
                  {!live.error.includes("Too many") && (
                    <button type="button" onClick={() => onCheckStatus(r.id)}
                      className="shrink-0 rounded-xl bg-[#007AFF]/10 px-3 py-1.5 text-xs font-bold text-[#007AFF]">
                      Retry
                    </button>
                  )}
                </div>
              )}

              {/* Expanded actions */}
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
                  <button type="button" onClick={() => onReservationTap(r.id)}
                    className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 active:opacity-70">
                    Edit details
                  </button>
                  <button type="button" onClick={() => onCheckStatus(r.id)} disabled={live?.busy}
                    className="flex-1 rounded-xl bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 py-2 text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] active:opacity-70 disabled:opacity-50">
                    {live?.busy ? "Checking…" : "Live status"}
                  </button>
                  <button type="button"
                    onClick={() => { if (window.confirm("Delete this flight?")) onDelete(r.id); }}
                    className="rounded-xl bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 active:opacity-70">
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Past toggle */}
      {past.length > 0 && (
        <button type="button" onClick={() => setShowPast(v => !v)}
          className="w-full text-center text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] py-2">
          {showPast ? "Hide past flights" : `Show ${past.length} past flight${past.length > 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}
