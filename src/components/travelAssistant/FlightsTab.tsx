"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Plane, Trash2 } from "lucide-react";
import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { buildLiveAirportMapUrl } from "@/lib/travelAssistant/liveMapSession";
import { hasAirportLayout } from "@/lib/airportNav/getLayout";
import { selectPreviewAirportFlight, toUtcMs as flightToUtcMs } from "@/lib/travelAssistant/useActiveFlight";
import {
  flightBookLeadMode,
  nextFlightShowsStatusChrome,
  shouldAutoCheckNextFlightStatus,
  showFlightSearchLauncherAtTop,
  showFlightArrivalAirportMapCta,
  showFlightDepartureAirportMapCta,
} from "@/lib/travelAssistant/flightBookLead";
import { FlightSearchLauncher, type FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import { ImportConfirmationDropzone } from "@/components/travelAssistant/ImportConfirmationDropzone";
import { FlightSearchModal } from "@/components/travelAssistant/FlightSearchModal";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";
import { sortFlightsByDeparture, flightDepartureUtcMs, selectNextRemainingFlight } from "@/lib/travelAssistant/flightSort";
import { canonicalFlightDepartureLocalTime } from "@/lib/travelAssistant/tripWindow";
import { shouldShowTerminalExplorePromo } from "@/lib/travelAssistant/homeDayTruth";
import {
  formatReservationCostLine,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import {
  reservationAttentionBadge,
  reservationAttentionKind,
  reservationAttentionRingClass,
} from "@/lib/travelAssistant/reservationAttention";
import { disruptionCalmFooterCta, disruptionCalmKind } from "@/lib/travelAssistant/disruptionCalm";

import { BOOK_LIST_CARD_CLASS } from "@/components/travelAssistant/bookTabStyles";
import { TripTransportRouteMap } from "@/components/travelAssistant/TripTransportRouteMap";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { ItinerarySelfCheckResult } from "@/lib/travelAssistant/itinerarySelfCheck";
import { flightCardTypography, hotelCardTypography } from "@/lib/ui/mobileTypography";
import { appleBtnText } from "@/lib/ui/appleDesign";

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
  tripId?: string | null;
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
  const depMs = flightDepartureUtcMs(r);
  if (!Number.isNaN(depMs)) return Date.now() - depMs > 18 * 3600_000;
  return false;
}

function minsUntilDep(r: Reservation): number {
  const ms = flightDepartureUtcMs(r);
  return Number.isNaN(ms) ? Infinity : (ms - Date.now()) / 60_000;
}

/* ─── Live status badge ──────────────────────────────────────── */
function StatusBadge({ r, live }: { r: Reservation; live?: LiveStatusResult }) {
  const t = useTranslations("FlightsTab");
  const status = live?.flightStatus || r.flightStatus || "";
  const delay = live?.delayMinutes ?? r.flightDelayMinutes ?? 0;
  const onTime = live?.onTime ?? r.flightOnTime;
  const s = status.toLowerCase();

  if (live?.busy) return (
    <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold text-slate-500 animate-pulse">
      {t("statusChecking")}
    </span>
  );
  if (s === "cancelled") return (
    <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      {t("statusCancelled")}
    </span>
  );
  if (delay > 0 || s === "delayed") return (
    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      {t("statusDelayed", { delay: delay || "?" })}
    </span>
  );
  if (onTime === true || s === "scheduled" || s === "active" || s === "en-route") return (
    <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-2.5 py-0.5 text-xs lg:text-[10px] font-bold">
      {t("statusOnTime")}
    </span>
  );
  return null;
}

function AirportMapRow({
  iata,
  rich,
  tripId,
  mode = "depart",
}: {
  iata: string;
  rich: boolean;
  tripId?: string | null;
  mode?: "depart" | "arrive";
}) {
  const t = useTranslations("FlightsTab");
  const href = buildLiveAirportMapUrl({ tripId, iata, mode });
  return (
    <LiveMapLink
      href={href}
      className="block w-full border-t border-[var(--border-default)] px-4 py-3 text-left transition active:opacity-80"
    >
      <p className="text-[15px] font-semibold text-[var(--text-primary)]">
        {mode === "arrive"
          ? t("arrivalAirportMapTitle", { iata })
          : rich
            ? t("exploreTerminalTitle", { iata })
            : t("airportMapTitle", { iata })}
      </p>
      <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-secondary)]">
        {mode === "arrive"
          ? t("arrivalAirportMapBody")
          : rich
            ? t("exploreTerminalBody")
            : t("airportMapBody")}
      </p>
      <p className="mt-1 text-[15px] font-semibold text-[var(--accent)]">
        {mode === "arrive"
          ? t("arrivalAirportMapCta")
          : rich
            ? t("exploreTerminalCta")
            : t("airportMapCta")}
      </p>
    </LiveMapLink>
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
  tripId = null,
  flightSearchDefaults,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy = false,
  liveStatus = {},
  locationStatus: _locationStatus = "unknown",
  nearestAirport = "",
  onReservationTap, onCheckStatus, onDelete, onAdd,
  simplifiedMobile = false,
  enableBookSearch = false,
  hideRouteMap = false,
}: FlightsTabProps) {
  const t = useTranslations("FlightsTab");
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
    const up = sortFlightsByDeparture(deduped.filter(r => !isCompleted(r)));
    const pa = sortFlightsByDeparture(deduped.filter(r => isCompleted(r)).reverse());
    const next = selectNextRemainingFlight(up, Date.now(), {
      physicalAirportIata: nearestAirport || null,
    });
    return { upcoming: up, past: pa, nextFlight: next };
  }, [reservations, nearestAirport]);

  const shown = showPast ? [...upcoming, ...past] : upcoming;
  const lead = flightBookLeadMode({ upcomingFlightCount: upcoming.length });

  const autoCheckedNextIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nextFlight) return;
    if (autoCheckedNextIdRef.current === nextFlight.id) return;
    const live = liveStatus[nextFlight.id];
    const hasLive = Boolean(
      live && !live.busy && (live.checkedAt || live.flightStatus) && !live.error,
    );
    if (
      !shouldAutoCheckNextFlightStatus({
        hasNextFlight: true,
        hasLiveStatus: hasLive,
        hoursUntilDeparture: minsUntilDep(nextFlight) / 60,
      })
    ) {
      return;
    }
    autoCheckedNextIdRef.current = nextFlight.id;
    onCheckStatus(nextFlight.id);
  }, [nextFlight, liveStatus, onCheckStatus]);

  // Determine what to show at the top — Apple approach:
  // The app knows where you are in your journey and shows the right card automatically
  const nowMs = Date.now();

  const previewAirportFlight = useMemo(
    () => selectPreviewAirportFlight(reservations, nowMs),
    [reservations, nowMs],
  );
  const previewDepartureIata = previewAirportFlight?.f.flightDepartureAirport ?? "";
  const previewDepUtcMs = previewAirportFlight
    ? flightToUtcMs(
        canonicalFlightDepartureLocalTime(previewAirportFlight.f) ||
          previewAirportFlight.f.flightDepartureTime ||
          previewAirportFlight.f.localTime ||
          "",
        previewAirportFlight.f.timezone,
      )
    : Number.NaN;
  const canExploreTerminal =
    hasAirportLayout(previewDepartureIata) &&
    shouldShowTerminalExplorePromo(
      Number.isFinite(previewDepUtcMs) ? previewDepUtcMs : null,
      nowMs,
    );

  // Book search chrome: one search surface only (launcher OR header buttons, not both).
  // G18 — launcher only when there are no upcoming tickets.
  const showSearchLauncher =
    showBookSearch &&
    !enableBookSearch &&
    showFlightSearchLauncherAtTop(lead, flightSearchOpen);

  return (
    <section className={`space-y-4 pb-6 ${type.section}`}>
      {showSearchLauncher ? (
        <FlightSearchLauncher
          tripName={tripName}
          defaults={flightSearchDefaults}
          onSearch={handleFlightSearch}
        />
      ) : null}

      {showBookSearch && pendingForwardReview && onOpenForwardReview ? (
        <button
          type="button"
          onClick={() => onOpenForwardReview(pendingForwardReview.id)}
          className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left shadow-sm transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:hover:bg-amber-500/20"
        >
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">{t("forwardBannerTitle")}</p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
            {pendingForwardReview.reason}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{t("forwardBannerCta")}</p>
        </button>
      ) : null}

      {showBookSearch && onImportConfirmation ? (
        <ImportConfirmationDropzone
          busy={importConfirmationBusy}
          onFile={onImportConfirmation}
        />
      ) : null}

      <FlightSearchModal
        open={flightSearchOpen}
        tripName={tripName}
        plan={flightSearchPlan}
        selectedLegs={flightSearchLegs}
        onClose={() => setFlightSearchOpen(false)}
      />

      {/* I36: travel-day guides live on Home + Airport Mode only — Flights is tickets. */}

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
            <h2 className={listType.heading}>{t("heading")}</h2>
            <p className={listType.subheading}>
              {t("bookedCount", { count: upcoming.length })}
              {past.length > 0 ? ` ${t("pastCount", { count: past.length })}` : ""}
            </p>
          </div>
          {!enableBookSearch ? (
            <div className="flex shrink-0 items-center gap-2">
              {lead === "itinerary" ? (
                <button
                  type="button"
                  onClick={() =>
                    handleFlightSearch(
                      { mode: "oneway", summary: "Custom flight search", url: "" },
                      [],
                    )
                  }
                  className={`shrink-0 ${simplifiedMobile ? listType.addBtn : type.addBtn}`}
                >
                  {t("searchFlights")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onAdd}
                className={`shrink-0 ${simplifiedMobile ? listType.addBtn : type.addBtn}`}
              >
                {t("addExisting")}
              </button>
            </div>
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
              {t("searchFlights")}
            </button>
            <button
              type="button"
              onClick={onAdd}
              className={`min-h-[48px] shrink-0 ${listType.addBtn}`}
            >
              {t("addExisting")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Empty */}
      {shown.length === 0 && (
        <div
          className={
            simplifiedMobile
              ? "rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--bg-card)] p-8 text-center"
              : "rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center"
          }
        >
          <p className="mb-3 text-[var(--text-tertiary)]">
            <Plane className="mx-auto h-8 w-8" strokeWidth={1.75} aria-hidden />
          </p>
          <p className="font-semibold text-slate-900 dark:text-white">{t("emptyTitle")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">{t("emptyBody")}</p>
          {!enableBookSearch ? (
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
              {t("searchFlights")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            {t("addExistingBooking")}
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
            cancelled: /cancel/iu.test(live?.flightStatus || r.flightStatus || ""),
            flightDelayed:
              attention === "problem" &&
              !transportConflictIds?.has(r.id) &&
              (Boolean(live?.delayMinutes && live.delayMinutes > 0) ||
                /delay|divert/iu.test(live?.flightStatus || r.flightStatus || "")),
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
            const showStatusChrome = isNext
              ? nextFlightShowsStatusChrome({ isNextFlight: isNext, isPast })
              : !isPast;
            const showDepartureAirportMap = showFlightDepartureAirportMapCta({
              isPast,
              departureIata: dep === "---" ? "" : dep,
            });
            const showArrivalAirportMap = showFlightArrivalAirportMapCta({
              isPast,
              departureIata: dep === "---" ? "" : dep,
              arrivalIata: arr === "---" ? "" : arr,
            });

            return (
              <div
                key={r.id}
                className={`${listType.card} overflow-hidden ${isPast ? "opacity-60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)] text-[var(--text-secondary)]">
                      <Plane className="h-5 w-5" strokeWidth={1.85} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={listType.title}>{flightTitle}</p>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {showStatusChrome ? <StatusBadge r={r} live={live} /> : null}
                          {attentionBadge && !isPast ? (
                            <span className={attentionBadge.className}>{attentionBadge.label}</span>
                          ) : costLine ? (
                            <span className="text-[17px] font-semibold text-[var(--text-primary)]">{costLine}</span>
                          ) : null}
                        </div>
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

                {showDepartureAirportMap ? (
                  <AirportMapRow
                    iata={dep}
                    rich={canExploreTerminal && isNext}
                    tripId={tripId}
                  />
                ) : null}
                {showArrivalAirportMap ? (
                  <AirportMapRow iata={arr} rich={false} tripId={tripId} mode="arrive" />
                ) : null}

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
                    ) : missingPrice && !isPast ? (
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
                isNext && attention === "none"
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
                      <Plane className="h-4 w-4 text-slate-500 dark:text-slate-400" strokeWidth={1.85} aria-hidden />
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
                <div className="border-t border-amber-200 px-5 py-2 dark:border-amber-500/30">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="text-xs font-bold text-amber-900 dark:text-amber-200"
                  >
                    {disruptionCalmFooterCta(
                      disruptionCalmKind({
                        cancelled: /cancel/iu.test(live?.flightStatus || r.flightStatus || ""),
                        delayed:
                          Boolean(live?.delayMinutes && live.delayMinutes > 0) ||
                          /delay|divert/iu.test(live?.flightStatus || r.flightStatus || ""),
                        connectionConflict: Boolean(transportConflictIds?.has(r.id)),
                      }),
                    ) ?? "Check this flight →"}
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
                  className={`${type.deleteBtn} inline-flex items-center justify-center`}
                  aria-label="Delete this flight">
                  <Trash2 className="h-4 w-4" strokeWidth={1.85} aria-hidden />
                </button>
              </div>
              {showFlightDepartureAirportMapCta({
                isPast,
                departureIata: dep === "---" ? "" : dep,
              }) ? (
                <AirportMapRow
                  iata={dep}
                  rich={canExploreTerminal && isNext}
                  tripId={tripId}
                />
              ) : null}
              {showFlightArrivalAirportMapCta({
                isPast,
                departureIata: dep === "---" ? "" : dep,
                arrivalIata: arr === "---" ? "" : arr,
              }) ? (
                <AirportMapRow iata={arr} rich={false} tripId={tripId} mode="arrive" />
              ) : null}
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
