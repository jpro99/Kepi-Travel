"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { TripFlightLegPicker } from "@/components/travelAssistant/TripFlightLegPicker";
import { InterCityTransportPrompts } from "@/components/travelAssistant/InterCityTransportPrompts";
import { TripFirstBanner } from "@/components/travelAssistant/TripFirstBanner";
import { FlightSearchLauncher, type FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import { ImportConfirmationDropzone } from "@/components/travelAssistant/ImportConfirmationDropzone";
import { FlightSearchModal } from "@/components/travelAssistant/FlightSearchModal";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";
import { buildGateInstructions, getAirportNav, buildArrivalGuide } from "@/lib/travelAssistant/airportNavigation";
import {
  formatReservationCostLine,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import {
  reservationAttentionBadge,
  reservationAttentionKind,
  reservationAttentionRingClass,
} from "@/lib/travelAssistant/reservationAttention";

import { BOOK_LIST_CARD_CLASS } from "@/components/travelAssistant/bookTabStyles";
import { TripTransportRouteMap } from "@/components/travelAssistant/TripTransportRouteMap";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { ItinerarySelfCheckResult } from "@/lib/travelAssistant/itinerarySelfCheck";
import { flightCardTypography, guideCardTypography, hotelCardTypography } from "@/lib/ui/mobileTypography";
import { appleBtnText, appleWarningPill } from "@/lib/ui/appleDesign";

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
  plannedOnly?: boolean;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
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
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  itinerarySelfCheck?: ItinerarySelfCheckResult;
  transportConflictIds?: Set<string>;
  tripName?: string | null;
  flightSearchDefaults?: FlightSearchDefaults;
  pendingForwardReview?: { id: string; reason: string; subject?: string } | null;
  onOpenForwardReview?: (reviewId: string) => void;
  onImportConfirmation?: (file: File) => void;
  importConfirmationBusy?: boolean;
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onQuickGroundTransport?: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
  /** Trips tab on phone: bigger type, fewer widgets. */
  simplifiedMobile?: boolean;
  /** Mobile Book tab — show search launchers and leg picker. */
  enableBookSearch?: boolean;
  /** Mobile Trip tab — route map lives on Map/Home globe */
  hideRouteMap?: boolean;
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

function flightCardSubtitle(flightNumber: string | undefined, dep: string, arr: string): string {
  return [flightNumber, `${dep} → ${arr}`].filter(Boolean).join(" • ");
}

function flightCardDepartureTime(dateLabel: string, timeLabel: string): string {
  return [dateLabel, timeLabel].filter(Boolean).join(" • ") || "—";
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
    <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold text-slate-500 animate-pulse">
      Checking…
    </span>
  );
  if (s === "cancelled") return (
    <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      CANCELLED
    </span>
  );
  if (delay > 0 || s === "delayed") return (
    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      +{delay || "?"}m DELAY
    </span>
  );
  if (onTime === true || s === "scheduled" || s === "active" || s === "en-route") return (
    <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      ON TIME
    </span>
  );
  return null;
}


/* ─── Arrival guide card — universal, works for all airports ────── */
function ArrivalGuideCard({ flight, simplifiedMobile = false }: { flight: Reservation; simplifiedMobile?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const iata = flight.flightArrivalAirport ?? "";
  if (!iata) return null;

  // Extract 2-letter airline code from flight number (e.g. "AS271" → "AS")
  const airlineCode = flight.flightNumber?.match(/^([A-Z]{2})/)?.[1] ?? "";
  const terminal = flight.flightArrivalTerminal ?? "";

  const guide = buildArrivalGuide(iata, airlineCode, terminal);

  return (
    <div className={`rounded-3xl overflow-hidden shadow-xl ${
      simplifiedMobile
        ? "bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]"
        : "bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900"
    }`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className={`font-bold uppercase tracking-wide ${simplifiedMobile ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm lg:text-[10px] lg:tracking-widest text-emerald-300/70"}`}>
            Arriving · {iata} · {guide.airportName}
          </p>
          <p className={`text-xl font-black mt-0.5 ${simplifiedMobile ? "text-[var(--text-primary)]" : "text-white"}`}>Landing guide</p>
        </div>
        <span className="text-3xl">🛬</span>
      </div>

      {/* Step indicator — baggage → exit → transport */}
      <div className="flex gap-0 mx-4 mb-3">
        {["🧳 Bags", "🚪 Exit", "🚗 Ride"].map((label, i) => (
          <div key={i} className="flex-1 text-center">
            <div className={`h-1 rounded-full mx-0.5 ${i === 0 ? "bg-emerald-400" : simplifiedMobile ? "bg-[var(--bg-muted)]" : "bg-white/20"}`} />
            <p className={`text-[9px] mt-1 font-medium ${simplifiedMobile ? "text-[var(--text-muted)]" : "text-white/40"}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Baggage claim — always visible */}
      <div className={`mx-4 mb-2 rounded-2xl px-4 py-3 ${simplifiedMobile ? "bg-[var(--bg-muted)] border border-[var(--border-default)]" : "bg-white/10 border border-white/[0.08]"}`}>
        <p className={`font-bold uppercase tracking-wide mb-2 ${simplifiedMobile ? "text-sm text-emerald-800 dark:text-emerald-300" : "text-sm lg:text-[10px] lg:tracking-widest text-emerald-200/60"}`}>
          🧳 {guide.baggage.heading}
        </p>
        {guide.baggage.steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 mb-1.5 last:mb-0">
            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
            <p className={`text-sm leading-snug ${simplifiedMobile ? "text-[var(--text-primary)]" : "text-white/90"}`}>{step}</p>
          </div>
        ))}
        <p className={`text-[11px] mt-2 ${simplifiedMobile ? "text-[var(--text-muted)]" : "text-emerald-200/40"}`}>~{guide.baggage.walkMinutes} min from gate to carousel</p>
      </div>

      {/* Exit directions — always visible */}
      <div className={`mx-4 mb-2 rounded-2xl px-4 py-3 ${simplifiedMobile ? "bg-[var(--bg-muted)] border border-[var(--border-default)]" : "bg-white/10 border border-white/[0.08]"}`}>
        <p className={`font-bold uppercase tracking-wide mb-2 ${simplifiedMobile ? "text-sm text-emerald-800 dark:text-emerald-300" : "text-sm lg:text-[10px] lg:tracking-widest text-emerald-200/60"}`}>
          🚪 {guide.exit.heading}
        </p>
        {guide.exit.steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 mb-1.5 last:mb-0">
            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
            <p className={`text-sm leading-snug ${simplifiedMobile ? "text-[var(--text-primary)]" : "text-white/90"}`}>{step}</p>
          </div>
        ))}
      </div>

      {/* Rideshare — always visible */}
      <div className={`mx-4 mb-2 rounded-2xl px-4 py-3 ${simplifiedMobile ? "bg-[var(--bg-muted)] border border-[var(--border-default)]" : "bg-white/10 border border-white/[0.08]"}`}>
        <p className={`font-bold uppercase tracking-wide mb-2 ${simplifiedMobile ? "text-sm text-emerald-800 dark:text-emerald-300" : "text-sm lg:text-[10px] lg:tracking-widest text-emerald-200/60"}`}>
          🚗 {guide.rideshare.heading}
        </p>
        <p className={`text-sm leading-snug ${simplifiedMobile ? "text-[var(--text-primary)]" : "text-white/90"}`}>{guide.rideshare.instructions}</p>
      </div>

      {/* Tips — collapsible */}
      {guide.tips.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className={`w-full px-4 py-2 text-center text-xs font-semibold transition ${simplifiedMobile ? "text-emerald-700 dark:text-emerald-400 hover:text-emerald-900" : "text-emerald-300/60 hover:text-emerald-200"}`}
          >
            {expanded ? "▲ Hide tips" : `▼ ${guide.tips.length} tip${guide.tips.length > 1 ? "s" : ""} for this airport`}
          </button>
          {expanded && (
            <div className={`mx-4 mb-4 rounded-2xl px-4 py-3 space-y-2 ${simplifiedMobile ? "bg-[var(--bg-muted)] border border-[var(--border-default)]" : "bg-white/[0.06] border border-white/[0.06]"}`}>
              {guide.tips.map((tip, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 shrink-0">💡</span>
                  <p className={`text-xs leading-relaxed ${simplifiedMobile ? "text-[var(--text-muted)]" : "text-white/70"}`}>{tip}</p>
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
  flight, live, locationStatus, onCheckStatus, simplifiedMobile = false,
}: {
  flight: Reservation;
  live?: LiveStatusResult;
  locationStatus: string;
  onCheckStatus: (id: string) => void;
  simplifiedMobile?: boolean;
}) {
  const guideType = guideCardTypography(simplifiedMobile);
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
  const minsToDep = minsUntilDep(flight);
  const showTerminalNavigator = Boolean(iata) && isAtAirport;
  const delay = live?.delayMinutes ?? flight.flightDelayMinutes ?? 0;
  const status = (live?.flightStatus || flight.flightStatus || "").toLowerCase();
  const cancelled = status === "cancelled";

  return (
    <div className={`rounded-3xl overflow-hidden shadow-xl ${
      cancelled
        ? "bg-red-50 ring-1 ring-red-200 dark:bg-red-950 dark:ring-red-900"
        : simplifiedMobile
          ? guideType.shell
          : "bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900"
    }`}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className={guideType.eyebrow}>
            {isAirside ? "You're airside ·" : isAtAirport ? "You're at the airport ·" : "Next flight ·"} {iata} → {flight.flightArrivalAirport ?? ""}
          </p>
          <p className={`text-2xl font-black mt-1 leading-tight ${guideType.title}`}>
            {flight.flightAirline ?? flight.provider}{flight.flightNumber ? ` ${flight.flightNumber}` : ""}
          </p>
          <p className={`font-semibold mt-1 ${guideType.subtitle} ${simplifiedMobile ? "text-lg" : "text-base"}`}>{fmt12(flight.flightDepartureTime ?? flight.localTime ?? "")} · {fmtDate(flight.flightDate ? flight.flightDate + " 00:00" : flight.localTime ?? "")}</p>
        </div>
        <StatusBadge r={flight} live={live} />
      </div>

      {/* Gate · Terminal · Seat row */}
      <div className={`mx-4 mb-4 grid grid-cols-3 gap-3`}>
        {[
          { label: "GATE", value: gate || "—", highlight: Boolean(gate), loading: live?.busy && !gate },
          { label: "TERMINAL", value: terminal || "—", highlight: Boolean(terminal) },
          { label: "SEAT", value: flight.flightSeatNumber || "—", highlight: Boolean(flight.flightSeatNumber) },
        ].map(({ label, value, highlight, loading }) => (
          <div key={label} className={`${guideType.gateBox} ${guideType.gatePad}`}>
            <p className={guideType.gateLabel}>{label}</p>
            {loading ? (
              <p className="text-sm text-[var(--text-muted)] animate-pulse mt-1">…</p>
            ) : (
              <p className={`${guideType.gateValue} ${highlight ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] opacity-60"}`}>{value}</p>
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
        <div className={`mx-4 mb-4 ${guideType.panel}`}>
          <div className={`flex items-center justify-between px-4 py-2 border-b ${simplifiedMobile ? "border-[var(--border-default)]" : "border-white/10"}`}>
            <p className={guideType.panelHeader}>
              {hasNav ? `Route to Gate ${gate}` : `Getting to Gate ${gate}`}
            </p>
            {totalMinutes > 0 && (
              <span className={`font-medium ${guideType.mutedText} ${simplifiedMobile ? "text-sm" : "text-sm lg:text-[10px]"}`}>~{totalMinutes} min</span>
            )}
          </div>
          <div className={`divide-y ${simplifiedMobile ? "divide-[var(--border-default)]" : "divide-white/5"}`}>
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-sm shrink-0 mt-0.5">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${guideType.bodyText}`}>{step.text}</p>
                  {step.detail && <p className={`text-[10px] mt-0.5 ${guideType.mutedText}`}>{step.detail}</p>}
                  {step.minutes > 0 && <p className="text-[10px] mt-0.5 text-sky-600 dark:text-sky-400">~{step.minutes} min</p>}
                </div>
              </div>
            ))}
          </div>
          {hasNav && (
            <p className={`text-[9px] text-center pb-2 px-4 ${guideType.mutedText}`}>Based on {iata} layout · verify on airport boards</p>
          )}
        </div>
      )}

      {showTerminalNavigator ? (
        <div className="mx-4 mb-3">
          <LiveMapLink
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:bg-[#0066DD]"
          >
            Open terminal navigator
            <span aria-hidden>→</span>
          </LiveMapLink>
          <p className={`mt-2 text-center text-[10px] ${guideType.mutedText}`}>
            {hasNav
              ? `Gate routing · lounges · ${iata} terminal map`
              : `Live map at ${iata} when you're at the airport`}
          </p>
        </div>
      ) : null}

      {/* No gate yet — prompt check status */}
      {isAtAirport && !gate && (
        <div className={`mx-4 mb-4 ${guideType.panel} px-4 py-3 flex items-center justify-between gap-3`}>
          <div>
            <p className={`text-sm font-semibold ${guideType.bodyText}`}>Gate not assigned yet</p>
            <p className={`text-xs mt-0.5 ${guideType.mutedText}`}>Check the boards or tap to get live status</p>
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
          className={`w-full rounded-2xl font-bold disabled:opacity-50 transition flex items-center justify-center gap-2 ${guideType.refreshBtn} ${
            simplifiedMobile
              ? "bg-[var(--bg-muted)] border border-[var(--border-default)] text-[var(--text-primary)] hover:opacity-90"
              : "bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
          }`}
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
  reservations,
  transportReservations,
  plannedFlightLegs = [],
  itinerarySelfCheck,
  transportConflictIds,
  tripName,
  flightSearchDefaults,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy = false,
  liveStatus = {}, locationStatus = "unknown", nearestAirport = "",
  onReservationTap, onCheckStatus, onDelete, onAdd, onQuickGroundTransport,
  simplifiedMobile = false,
  enableBookSearch = false,
  hideRouteMap = false,
}: FlightsTabProps) {
  const showBookSearch = !simplifiedMobile || enableBookSearch;
  const type = flightCardTypography(simplifiedMobile);
  const listType = hotelCardTypography(simplifiedMobile);
  const detailLabel = type.detailLabel;
  const detailValue = type.detailValue;
  const actionBtn = type.actionBtn;
  const airportCode = type.airportCode;
  const timeText = type.timeText;
  const dateText = type.dateText;

  const [showPast, setShowPast] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flightSearchOpen, setFlightSearchOpen] = useState(false);
  const [flightSearchPlan, setFlightSearchPlan] = useState<FlightSearchPlan | null>(null);
  const [flightSearchLegs, setFlightSearchLegs] = useState<PlannedFlightLeg[]>([]);

  const handleFlightSearch = (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]): void => {
    setFlightSearchPlan(plan);
    setFlightSearchLegs(selectedLegs);
    setFlightSearchOpen(true);
  };

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
    <section className={`space-y-4 pb-6 ${type.section}`}>
      {showBookSearch ? (
        <>
      <TripFirstBanner variant="flight" />

      <FlightSearchLauncher
        tripName={tripName}
        defaults={flightSearchDefaults}
        onSearch={handleFlightSearch}
      />

      {pendingForwardReview && onOpenForwardReview ? (
        <button
          type="button"
          onClick={() => onOpenForwardReview(pendingForwardReview.id)}
          className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left shadow-sm transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:hover:bg-amber-500/20"
        >
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
            Forwarded flight waiting for you
          </p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
            {pendingForwardReview.reason}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Tap to confirm and add to your flights →
          </p>
        </button>
      ) : null}

      {onImportConfirmation ? (
        <ImportConfirmationDropzone
          busy={importConfirmationBusy}
          onFile={onImportConfirmation}
        />
      ) : null}
        </>
      ) : null}

      <FlightSearchModal
        open={flightSearchOpen}
        tripName={tripName}
        plan={flightSearchPlan}
        selectedLegs={flightSearchLegs}
        onClose={() => setFlightSearchOpen(false)}
      />

      {/* ── ARRIVAL GUIDE — shown when airborne or just landed ── */}
      {!simplifiedMobile && showArrivalGuide && arrivalFlight && (
        <ArrivalGuideCard flight={arrivalFlight} simplifiedMobile={simplifiedMobile} />
      )}

      {/* ── DEPARTURE GUIDE — gate/terminal/seat for next flight ── */}
      {!simplifiedMobile && showGuide && nextFlight && (
        <AirportGuideCard
          flight={nextFlight}
          live={liveStatus[nextFlight.id]}
          locationStatus={locationStatus}
          onCheckStatus={onCheckStatus}
          simplifiedMobile={simplifiedMobile}
        />
      )}

      {showBookSearch && onQuickGroundTransport ? (
        <>
      <InterCityTransportPrompts
        legs={plannedFlightLegs}
        onSearchFlights={handleFlightSearch}
        onQuickGroundTransport={onQuickGroundTransport}
      />

      {plannedFlightLegs.some((leg) => leg.status === "needed") ? (
        <TripFlightLegPicker legs={plannedFlightLegs} tripName={tripName} onSearch={handleFlightSearch} />
      ) : null}
        </>
      ) : null}

      {simplifiedMobile && !hideRouteMap ? (
        <TripTransportRouteMap
          reservations={transportReservations ?? reservations}
          plannedFlightLegs={plannedFlightLegs}
          onSegmentTap={onReservationTap}
          mobileProminent
          compactMobileHeader
          hideSegmentStrip
          sectionId="trip-route-map"
        />
      ) : null}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={listType.heading}>Your flights</h2>
            <p className={listType.subheading}>
              {upcoming.length} booked{past.length > 0 ? ` · ${past.length} past` : ""}
            </p>
          </div>
          {!enableBookSearch ? (
            <button
              type="button"
              onClick={onAdd}
              className={`shrink-0 ${simplifiedMobile ? listType.addBtn : type.addBtn}`}
            >
              Add existing
            </button>
          ) : null}
        </div>
        {enableBookSearch ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                handleFlightSearch(
                  { mode: "oneway", summary: "Custom flight search", url: "" },
                  [],
                )
              }
              className="min-h-[48px] flex-1 rounded-[var(--radius-button)] bg-[#007AFF] px-4 text-[17px] font-bold text-white"
            >
              Search flights
            </button>
            <button
              type="button"
              onClick={onAdd}
              className={`min-h-[48px] shrink-0 ${listType.addBtn}`}
            >
              Add existing
            </button>
          </div>
        ) : null}
      </div>

      {/* Empty */}
      {shown.length === 0 && !showGuide && (
        <div
          className={
            simplifiedMobile
              ? "rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--bg-card)] p-8 text-center"
              : "rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center"
          }
        >
          <p className="text-4xl mb-3">🛫</p>
          <p className="font-semibold text-slate-900 dark:text-white">No flights yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Use the search box above to find and book a flight, or add one you already booked.
          </p>
          <button
            type="button"
            onClick={() =>
              handleFlightSearch(
                {
                  mode: "oneway",
                  summary: "Custom flight search",
                  url: "",
                },
                [],
              )
            }
            className="mb-3 w-full rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-bold text-white"
          >
            Search flights
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Add existing booking
          </button>
        </div>
      )}

      {/* Flight cards */}
      <div className={simplifiedMobile ? "space-y-3" : "space-y-3"}>
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
          const missingPrice = reservationMissingPrice(r, reservations);
          const costLine = formatReservationCostLine(r, { allReservations: shown });
          const attention = reservationAttentionKind(r, transportConflictIds);
          const attentionBadge = reservationAttentionBadge(attention, {
            connectionIssue: Boolean(transportConflictIds?.has(r.id)),
            flightDelayed:
              attention === "problem" &&
              !transportConflictIds?.has(r.id) &&
              (Boolean(live?.delayMinutes && live.delayMinutes > 0) ||
                /cancel|delay|divert/iu.test(live?.flightStatus || r.flightStatus || "")),
          });

          if (simplifiedMobile) {
            const gateLine =
              gate && gate !== "—"
                ? `Gate ${gate}${terminal && terminal !== "—" ? ` · Terminal ${terminal}` : ""}`
                : undefined;
            const routeLine = `${dep} → ${arr}`;
            const timeLine = `${date} · ${depTime}${arrTime && arrTime !== "—" ? ` → ${arrTime}` : ""}`;
            const flightTitle =
              r.flightNumber?.trim() ||
              r.title?.trim() ||
              `${r.flightAirline ?? r.provider} flight`.trim();

            return (
              <div
                key={r.id}
                className={`${listType.card} overflow-hidden ${past ? "opacity-60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)] text-lg text-[var(--text-secondary)]">
                      ✈️
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={listType.title}>{flightTitle}</p>
                        {attentionBadge && !past ? (
                          <span className={attentionBadge.className}>{attentionBadge.label}</span>
                        ) : missingPrice && !past ? (
                          <span className={appleWarningPill}>Add cost</span>
                        ) : costLine ? (
                          <span className="shrink-0 text-[17px] font-semibold text-[var(--text-primary)]">{costLine}</span>
                        ) : null}
                      </div>
                      <p className={listType.location}>{routeLine}</p>
                      <p className={`${listType.metadata} mt-1`}>{timeLine}</p>
                      {gateLine ? (
                        <p className="mt-1 text-[15px] font-semibold text-[var(--accent)]">{gateLine}</p>
                      ) : null}
                    </div>
                    <span className="mt-1 shrink-0 text-[13px] text-[var(--text-tertiary)]">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {(isOpen || r.confirmationCode || r.flightSeatNumber) && (
                  <div className="space-y-3 border-t border-[var(--border-default)] px-4 pb-4 pt-3">
                    {r.flightSeatNumber ? (
                      <div>
                        <p className={listType.detailLabel}>Seat</p>
                        <p className={`${listType.detailValue} mt-0.5`}>{r.flightSeatNumber}</p>
                      </div>
                    ) : null}
                    {r.confirmationCode ? (
                      <div>
                        <p className={listType.detailLabel}>Confirmation</p>
                        <p className={`${listType.detailValue} mt-0.5`}>{r.confirmationCode}</p>
                      </div>
                    ) : null}
                    {costLine && !missingPrice ? (
                      <div>
                        <p className={listType.detailLabel}>Trip cost</p>
                        <p className={`${listType.detailValue} mt-0.5`}>{costLine}</p>
                      </div>
                    ) : missingPrice && !past ? (
                      <button
                        type="button"
                        onClick={() => onReservationTap(r.id)}
                        className={`${appleBtnText} text-left`}
                      >
                        Tap to add miles or cash
                      </button>
                    ) : null}
                    {isOpen ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onReservationTap(r.id)}
                          className={`${listType.actionBtn} ${listType.secondaryBtn}`}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => onCheckStatus(r.id)}
                          disabled={live?.busy}
                          className={`${listType.actionBtn} font-semibold text-[var(--accent)] disabled:opacity-50`}
                        >
                          {live?.busy ? "Checking…" : "Check status"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this flight?")) onDelete(r.id);
                          }}
                          className={`${listType.actionBtn} ${listType.destructiveBtn}`}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={r.id}
              className={`${BOOK_LIST_CARD_CLASS} ${
                isNext && !showGuide && attention === "none"
                  ? "ring-[#007AFF]/40 dark:ring-[#0A84FF]/30 shadow-blue-500/10"
                  : reservationAttentionRingClass(attention, isPast)
              } ${isPast ? "opacity-60" : ""}`}
            >
              {/* Tap to expand */}
              <button type="button" onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left">
                {/* Airline strip */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={type.airline}>
                      {r.flightAirline ?? r.provider}
                    </span>
                    {r.flightNumber && (
                      <span className={type.flightNum}>
                        {r.flightNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {attentionBadge && !isPast ? (
                      <span className={attentionBadge.className}>{attentionBadge.label}</span>
                    ) : costLine ? (
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{costLine}</span>
                    ) : null}
                    <StatusBadge r={r} live={live} />
                    <span className="text-slate-300 dark:text-slate-600 text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center px-5 pb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={airportCode}>{dep}</p>
                    <p className={timeText}>{depTime}</p>
                  </div>
                  <div className={`flex flex-col items-center gap-1.5 shrink-0 px-2 ${type.routeMid}`}>
                    <div className="flex items-center gap-1.5">
                      <div className="h-px w-10 bg-slate-300 dark:bg-slate-600" />
                      <span className="text-slate-500 dark:text-slate-400 text-xl leading-none" aria-hidden>✈</span>
                      <div className="h-px w-10 bg-slate-300 dark:bg-slate-600" />
                    </div>
                    <p className={dateText}>{date}</p>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className={airportCode}>{arr}</p>
                    <p className={timeText}>{arrTime || "—"}</p>
                  </div>
                </div>
              </button>

              {/* Perforated divider */}
              <div className="flex items-center px-4 py-0">
                <div className="h-4 w-4 rounded-full bg-[var(--bg-base)] -ml-6 shrink-0" />
                <div className="flex-1 border-t-2 border-dashed border-[var(--border-default)] mx-1" />
                <div className="h-4 w-4 rounded-full bg-[var(--bg-base)] -mr-6 shrink-0" />
              </div>

              {/* Bottom details */}
              <div className={`grid grid-cols-4 gap-3 px-5 ${type.detailsPad}`}>
                {[
                  { label: "TERMINAL", value: terminal || "—" },
                  { label: "GATE", value: gate || "—", highlight: Boolean(gate) },
                  { label: "SEAT", value: r.flightSeatNumber || "—" },
                  { label: "CONF", value: r.confirmationCode?.slice(0, 7) || "—" },
                ].map(({ label, value, highlight }) => (
                  <div key={label}>
                    <p className={detailLabel}>{label}</p>
                    <p className={`${detailValue} ${highlight ? "text-[#007AFF] dark:text-[#0A84FF]" : "text-slate-900 dark:text-white"}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              {attention === "missing-price" && !isPast ? (
                <div className="border-t border-yellow-200 px-5 py-2 dark:border-yellow-500/30">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="text-xs font-bold text-yellow-900 dark:text-yellow-200"
                  >
                    Tap to add cash or points spent →
                  </button>
                </div>
              ) : attention === "problem" && !isPast ? (
                <div className="border-t border-red-200 px-5 py-2 dark:border-red-500/30">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="text-xs font-bold text-red-800 dark:text-red-200"
                  >
                    {transportConflictIds?.has(r.id) ? "Connection problem — tap to review →" : "Flight issue — tap to review →"}
                  </button>
                </div>
              ) : null}

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

              {/* Quick delete — always visible */}
              <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
                <button type="button" onClick={() => onReservationTap(r.id)}
                  className={`${actionBtn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
                  Edit
                </button>
                <button type="button" onClick={() => onCheckStatus(r.id)} disabled={live?.busy}
                  className={`${actionBtn} bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 text-[#007AFF] dark:text-[#0A84FF] disabled:opacity-50`}>
                  {live?.busy ? "Checking…" : "Status"}
                </button>
                <button type="button"
                  onClick={() => { if (window.confirm("Delete this flight?")) onDelete(r.id); }}
                  className={type.deleteBtn}>
                  🗑
                </button>
              </div>
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

      {!simplifiedMobile ? (
      <TripTransportRouteMap
        reservations={transportReservations ?? reservations}
        plannedFlightLegs={plannedFlightLegs}
        selfCheck={itinerarySelfCheck}
        onSegmentTap={onReservationTap}
      />
      ) : null}
    </section>
  );
}
