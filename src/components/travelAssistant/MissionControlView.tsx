"use client";

import { useEffect, useMemo, useState } from "react";
import type { TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";
import {
  buildMissionControlSnapshot,
  type DayReadiness,
  type MissionControlReservation,
  type MissionControlZoom,
  type ReadinessStatus,
} from "@/lib/travelAssistant/tripPhase";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { CheckInHandoffContent } from "@/lib/travelAssistant/checkInHandoff";
import { CheckInHandoffCard } from "@/components/travelAssistant/CheckInHandoffCard";
import {
  buildConnectionCalmStatus,
  buildHomePrepWatchItems,
  isTravelDayTakeover,
  shouldShowTravelOpsChrome,
  type ConnectionCalmStatus,
} from "@/lib/travelAssistant/homeDayTruth";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { addIsoDays, buildTripCompleteness } from "@/lib/travelAssistant/tripNightCoverage";
import { TripCompletenessBar } from "@/components/travelAssistant/TripCompletenessBar";
import { FreePlanSoftBanner } from "@/components/billing/FreePlanSoftBanner";
import { formatFlightStatusTrustLine } from "@/lib/travelAssistant/flightStatusTrustLine";

export interface MissionControlLiveStatus {
  flightStatus?: string;
  delayMinutes?: number | null;
  departureGate?: string;
  onTime?: boolean | null;
  checkedAt?: string;
  busy?: boolean;
  error?: string | null;
}

export interface MissionControlViewProps {
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reservations: MissionControlReservation[];
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  liveStatus?: Record<string, MissionControlLiveStatus>;
  hasActiveTrip?: boolean;
  /** Journey phase for travel-day takeover (airborne / just-landed). */
  journeyPhase?: JourneyPhase;
  checkInHandoff?: CheckInHandoffContent | null;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  /** Soft Free→Pro clarity (I41). Hidden when Pro/lifetime. */
  showFreePlanNudge?: boolean;
  onSeeProPlans?: () => void;
  /** For prep-mode Watch (I43). */
  missingPriceCount?: number;
  /** Batch 1 — gate/delay push onboarding on Home. */
  pushSubscribed?: boolean;
  pushBusy?: boolean;
  onEnablePush?: () => void;
  onOpenBook: () => void;
  onOpenPlan: () => void;
  onOpenAirportMode: () => void;
  onStartNewTrip?: () => void;
  onImportFlights?: () => void;
  onReservationTap?: (id: string) => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onSeeAllAttention?: () => void;
}

function statusColor(status: ReadinessStatus): string {
  if (status === "set") return "#34C759";
  if (status === "watch") return "#007AFF";
  if (status === "problem") return "#FF3B30";
  return "#FF9F0A";
}

function statusLabel(status: ReadinessStatus): string {
  if (status === "set") return "Set";
  if (status === "watch") return "Watch";
  if (status === "problem") return "Action needed";
  return "Needs you";
}

function heroTitle(
  status: ReadinessStatus,
  zoom: MissionControlZoom,
  options?: { day?: DayReadiness; daysUntil?: number | null; prepMode?: boolean },
): string {
  if (status === "problem") return "Action needed";
  if (options?.prepMode && (zoom === "today" || zoom === "trip")) {
    const days = options.daysUntil;
    if (days != null && days > 30) {
      return `Trip in about ${Math.max(1, Math.round(days / 7))} weeks`;
    }
    if (days != null && days > 0) {
      return `${days} day${days === 1 ? "" : "s"} until departure`;
    }
    return "Prep for your trip";
  }
  if (zoom === "today") {
    if (status === "set") return "Today is set";
    if (status === "watch") return "Today looks light";
    return "Today needs you";
  }
  if (zoom === "week") {
    if (status === "set") return "This week is set";
    return "This week needs you";
  }
  if (status === "set") return "Trip looks ready";
  return "Trip needs you";
}

export function MissionControlView({
  tripName,
  destination,
  startDate,
  endDate,
  reservations,
  stayDecisions,
  liveStatus,
  hasActiveTrip = true,
  journeyPhase,
  checkInHandoff = null,
  locationStatus = "unknown",
  showFreePlanNudge = false,
  onSeeProPlans,
  missingPriceCount = 0,
  pushSubscribed = false,
  pushBusy = false,
  onEnablePush,
  onOpenBook,
  onOpenPlan,
  onOpenAirportMode,
  onStartNewTrip,
  onImportFlights,
  onReservationTap,
  onGapActionTap,
  onSeeAllAttention,
}: MissionControlViewProps) {
  const [zoom, setZoom] = useState<MissionControlZoom>("today");
  const [zoomTouched, setZoomTouched] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayReadiness | null>(null);

  const snap = useMemo(
    () =>
      buildMissionControlSnapshot({
        name: tripName,
        destination,
        startDate,
        endDate,
        reservations,
        stayDecisions,
        liveStatusByReservationId: liveStatus,
        hasActiveTrip,
      }),
    [
      tripName,
      destination,
      startDate,
      endDate,
      reservations,
      stayDecisions,
      liveStatus,
      hasActiveTrip,
    ],
  );

  const showTravelOps = shouldShowTravelOpsChrome(snap.daysUntilDeparture);
  const prepMode = !showTravelOps;

  useEffect(() => {
    if (zoomTouched) return;
    if (prepMode) setZoom("trip");
  }, [prepMode, zoomTouched]);

  const connectionCalm: ConnectionCalmStatus = useMemo(
    () =>
      showTravelOps
        ? buildConnectionCalmStatus(reservations as TransportRouteReservation[])
        : { kind: "none", line: null },
    [reservations, showTravelOps],
  );

  const completeness = useMemo(
    () =>
      buildTripCompleteness({
        reservations,
        stayDecisions,
        tripStartDate: startDate,
        tripEndDate: endDate,
      }),
    [reservations, stayDecisions, startDate, endDate],
  );

  const prepWatchItems = useMemo(() => {
    const hotelCities = reservations
      .filter((r) => (r.type ?? "").toLowerCase() === "hotel")
      .map((r) => r.location?.trim() || r.title?.trim() || "")
      .filter(Boolean);
    return buildHomePrepWatchItems({
      daysUntilDeparture: snap.daysUntilDeparture,
      destination,
      hotelCities,
      staysComplete: completeness.flights === "green" && completeness.hotels === "green",
      missingPriceCount,
    });
  }, [
    reservations,
    snap.daysUntilDeparture,
    destination,
    completeness.flights,
    completeness.hotels,
    missingPriceCount,
  ]);

  const atAirport =
    locationStatus === "at-airport" || locationStatus === "in-terminal";
  const travelTakeover =
    journeyPhase != null && isTravelDayTakeover(journeyPhase, snap.openAirportMode || atAirport);

  // I36 — Wallet-grade travel day: one headline, one CTA, nothing else.
  if (travelTakeover) {
    const gate = snap.nextFlight ? liveStatus?.[snap.nextFlight.id]?.departureGate : null;
    const routeLabel = snap.nextFlight
      ? `${snap.nextFlight.flightDepartureAirport ?? ""} → ${snap.nextFlight.flightArrivalAirport ?? ""}`
      : snap.identityLabel;

    let eyebrow = "Travel day";
    let title = snap.leaveByHint || "You're traveling today";
    let detail: string | null = routeLabel;
    let tone: "blue" | "green" = "blue";

    if (journeyPhase?.kind === "airborne") {
      eyebrow = "In the air";
      title = `${(journeyPhase.onFlight as { flightDepartureAirport?: string }).flightDepartureAirport ?? ""} → ${journeyPhase.landingAt}`;
      detail = `Landing in ${journeyPhase.landingIn}`;
    } else if (journeyPhase?.kind === "just-landed") {
      eyebrow = "Just landed";
      title = "You're on the ground";
      detail =
        journeyPhase.landedMinutesAgo < 2
          ? "Just now"
          : `${journeyPhase.landedMinutesAgo} minutes ago`;
      tone = "green";
    } else if (atAirport) {
      eyebrow = locationStatus === "in-terminal" ? "In the terminal" : "At the airport";
      title = gate ? `Gate ${gate}` : "Open Airport Mode";
      detail = snap.nextFlight
        ? `${snap.nextFlight.flightNumber || "Flight"} · ${routeLabel}`
        : "Your next steps are on the airport map";
    } else if (snap.leaveByHint) {
      title = snap.leaveByHint;
      detail = gate
        ? `Gate ${gate} · ${routeLabel}`
        : snap.nextFlight
          ? `${snap.nextFlight.flightNumber || "Flight"} · ${routeLabel}`
          : detail;
    }

    const heroBg = tone === "green" ? "#34C759" : "#007AFF";
    const ctaText = tone === "green" ? "#1D1D1F" : "#007AFF";

    return (
      <section
        className="space-y-3"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
      >
        <article
          className="rounded-3xl px-5 py-8 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
          style={{ background: heroBg }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/70">{eyebrow}</p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-tight leading-tight">{title}</h2>
          {detail ? <p className="mt-2 text-[17px] text-white/85">{detail}</p> : null}
          {connectionCalm.kind === "conflict" && connectionCalm.line ? (
            <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-[14px] font-medium text-white">
              {connectionCalm.line}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onOpenAirportMode}
            className="mt-6 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-white text-[17px] font-semibold"
            style={{ color: ctaText }}
          >
            Open Airport Mode
          </button>
        </article>

        {checkInHandoff && journeyPhase?.kind !== "airborne" ? (
          <CheckInHandoffCard content={checkInHandoff} />
        ) : null}

        <button
          type="button"
          onClick={onOpenPlan}
          className="flex min-h-[44px] w-full items-center justify-center text-[15px] font-semibold text-[#007AFF]"
        >
          Trip overview
        </button>
      </section>
    );
  }

  if (snap.phase === "no_trip") {
    return (
      <section className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-12 text-center">
        <h1
          className="text-[28px] font-semibold tracking-tight text-[#1D1D1F]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
        >
          Where are you going?
        </h1>
        <p className="mt-2 max-w-sm text-[17px] leading-relaxed text-[#6E6E73]">
          Add your trip and Kepi shows what matters today, this week, and for the whole trip.
        </p>
        {onStartNewTrip ? (
          <button
            type="button"
            onClick={onStartNewTrip}
            className="mt-8 min-h-[52px] w-full max-w-sm rounded-2xl bg-[#007AFF] px-6 text-[17px] font-semibold text-white"
          >
            Plan a trip
          </button>
        ) : null}
        {onImportFlights ? (
          <button
            type="button"
            onClick={onImportFlights}
            className="mt-3 min-h-[48px] text-[15px] font-medium text-[#007AFF]"
          >
            Already have flights? Import them
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenBook}
            className="mt-3 min-h-[48px] text-[15px] font-medium text-[#007AFF]"
          >
            Already have flights? Open Book
          </button>
        )}
      </section>
    );
  }

  const activeStatus =
    zoom === "today" ? snap.today.status : zoom === "week" ? weekStatus(snap.week) : snap.tripStatus;
  const activeSummary = prepMode
    ? prepWatchItems[0]?.detail ??
      "Prep mode — documents, stays, and pricing. Connection checks show closer to departure."
    : zoom === "today"
      ? snap.today.summary
      : zoom === "week"
        ? weekSummary(snap.week)
        : snap.tripSummary;
  const heroAttention = prepMode
    ? []
    : zoom === "today"
      ? snap.today.attention.slice(0, 3)
      : zoom === "trip"
        ? snap.attentionTop3
        : snap.week.flatMap((d) => d.attention).slice(0, 3);

  const primaryCta = (() => {
    if (travelTakeover || atAirport || snap.openAirportMode) {
      return { label: "Open Airport Mode", onClick: onOpenAirportMode };
    }
    if (snap.phase === "problem" && snap.attentionTop3[0]) {
      return {
        label: snap.attentionTop3[0].actionLabel || "Open flights",
        onClick: () => {
          const item = snap.attentionTop3[0]!;
          if (item.reservationId && onReservationTap) onReservationTap(item.reservationId);
          else if (item.actionTab && onGapActionTap) {
            onGapActionTap({
              tab: item.actionTab,
              context: item.actionContext,
            });
          } else onOpenBook();
        },
      };
    }
    if (heroAttention[0]?.actionLabel) {
      const item = heroAttention[0];
      return {
        label: item.actionLabel!,
        onClick: () => {
          if (item.actionTab && onGapActionTap) {
            onGapActionTap({ tab: item.actionTab, context: item.actionContext });
          } else onOpenBook();
        },
      };
    }
    // One gap voice: only one primary CTA when something needs you.
    if (activeStatus !== "set" && heroAttention.length > 0) {
      return { label: "Open Plan", onClick: onOpenPlan };
    }
    return null;
  })();

  return (
    <section
      className="space-y-3"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
    >
      {/* Identity lives in the trip switcher — no black Mission Control label chrome (I36). */}

      {showFreePlanNudge && onSeeProPlans ? (
        <FreePlanSoftBanner visible onSeePro={onSeeProPlans} />
      ) : null}

      <TripCompletenessBar
        completeness={completeness}
        onOpenFlights={onOpenBook}
        onOpenPlan={onOpenPlan}
        onFindStayForGap={(gap) => {
          if (onGapActionTap) {
            onGapActionTap({
              tab: "reservations",
              context: {
                kind: "hotel",
                city: gap.suggestedCity,
                checkIn: gap.startNight,
                checkOut: addIsoDays(gap.endNight, 1),
              },
            });
            return;
          }
          onOpenBook();
        }}
      />

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#F5F5F7] p-1">
        {(
          [
            ["today", "Today"],
            ["week", "This week"],
            ["trip", "Trip"],
          ] as const
        ).map(([key, label]) => {
          const active = zoom === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setZoomTouched(true);
                setZoom(key);
              }}
              className={`min-h-[44px] rounded-xl text-[14px] font-semibold transition ${
                active ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#6E6E73]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <article
        className="rounded-2xl bg-[#F5F5F7] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        style={{ borderLeft: `4px solid ${statusColor(activeStatus)}` }}
      >
        <p
          className="text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: statusColor(activeStatus) }}
        >
          {statusLabel(activeStatus)}
        </p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-[#1D1D1F]">
          {heroTitle(activeStatus, zoom, {
            day: snap.today,
            daysUntil: snap.daysUntilDeparture,
            prepMode,
          })}
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-[#6E6E73]">{activeSummary}</p>

        {showTravelOps &&
        snap.leaveByHint &&
        (snap.phase === "departure_day" || snap.phase === "return_day") ? (
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[14px] font-medium text-[#1D1D1F]">
            {snap.leaveByHint}
          </p>
        ) : null}

        {showTravelOps && connectionCalm.line ? (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-[14px] font-medium ${
              connectionCalm.kind === "conflict"
                ? "bg-[#FF3B30]/10 text-[#1D1D1F]"
                : "bg-white text-[#1D1D1F]"
            }`}
          >
            {connectionCalm.line}
          </p>
        ) : null}

        {showTravelOps && !pushSubscribed && onEnablePush ? (
          <div className="mt-3 rounded-xl bg-white px-3 py-3 text-left">
            <p className="text-[13px] font-semibold text-[#6E6E73]">Flight alerts</p>
            <p className="mt-0.5 text-[14px] text-[#1D1D1F]">
              Turn on notifications for gate changes and delays — even when the app is closed.
            </p>
            <button
              type="button"
              disabled={pushBusy}
              onClick={onEnablePush}
              className="mt-2 min-h-[44px] w-full rounded-xl bg-[#007AFF] px-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {pushBusy ? "Enabling…" : "Enable flight alerts"}
            </button>
          </div>
        ) : null}

        {showTravelOps && pushSubscribed ? (
          <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-[13px] font-medium text-[#1D1D1F]">
            Flight alerts on — we&apos;ll notify you on gate changes and delays.
          </p>
        ) : null}

        {showTravelOps && snap.nextFlight && (zoom === "today" || snap.phase === "departure_day") ? (
          <button
            type="button"
            onClick={() => onReservationTap?.(snap.nextFlight!.id)}
            className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-left"
          >
            <p className="text-[13px] font-semibold text-[#6E6E73]">Next flight</p>
            <p className="mt-0.5 text-[16px] font-semibold text-[#1D1D1F]">
              {snap.nextFlight.flightNumber || "Flight"} ·{" "}
              {snap.nextFlight.flightDepartureAirport} → {snap.nextFlight.flightArrivalAirport}
            </p>
            <p className="mt-1 text-[14px] text-[#007AFF]">
              {formatFlightStatusTrustLine(liveStatus?.[snap.nextFlight.id])}
            </p>
          </button>
        ) : null}

        {prepMode && prepWatchItems.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {prepWatchItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white px-3 py-2.5 text-[14px] text-[#1D1D1F]"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[13px] text-[#6E6E73]">{item.detail}</p>
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-[13px] font-semibold text-[#007AFF]"
                  >
                    Official travel.state.gov guidance
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {heroAttention.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {heroAttention.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-[14px] text-[#1D1D1F]"
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: statusColor(item.status) }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.title}</p>
                  {item.detail ? <p className="mt-0.5 text-[13px] text-[#6E6E73]">{item.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {zoom === "trip" && snap.attentionOverflow > 0 && onSeeAllAttention ? (
          <button
            type="button"
            onClick={onSeeAllAttention}
            className="mt-2 text-[14px] font-semibold text-[#007AFF]"
          >
            See all ({snap.attentionOverflow + snap.attentionTop3.length})
          </button>
        ) : null}

        {primaryCta ? (
          <button
            type="button"
            onClick={primaryCta.onClick}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white"
          >
            {primaryCta.label}
          </button>
        ) : null}
      </article>

      {zoom === "week" ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {snap.week.map((day) => (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDay(day)}
              className="min-h-[88px] min-w-[88px] shrink-0 rounded-2xl bg-[#F5F5F7] px-3 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[11px] font-semibold uppercase text-[#6E6E73]">
                {day.label.split(",")[0]}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#1D1D1F]">{statusLabel(day.status)}</p>
              <span
                className="mt-2 inline-block h-2 w-2 rounded-full"
                style={{ background: statusColor(day.status) }}
              />
            </button>
          ))}
        </div>
      ) : null}

      {zoom === "today" && showTravelOps ? (
        <button
          type="button"
          onClick={() => setSelectedDay(snap.today)}
          className="flex min-h-[52px] w-full items-center justify-between rounded-2xl bg-[#F5F5F7] px-4 text-left"
        >
          <span>
            <span className="block text-[13px] font-semibold text-[#6E6E73]">Today&apos;s details</span>
            <span className="text-[15px] font-medium text-[#1D1D1F]">{snap.today.summary}</span>
          </span>
          <span className="text-[15px] font-semibold text-[#007AFF]">Open</span>
        </button>
      ) : null}

      {checkInHandoff ? <CheckInHandoffCard content={checkInHandoff} /> : null}

      {snap.tonightHotel && (snap.phase === "at_destination" || snap.phase === "departure_day") ? (
        <article className="rounded-2xl bg-[#F5F5F7] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
            {snap.phase === "departure_day" ? "Tonight" : "Where you are"}
          </p>
          <p className="mt-1 text-[17px] font-semibold text-[#1D1D1F]">
            {reservationPropertyName({
              type: "hotel",
              title: snap.tonightHotel.title,
              provider: snap.tonightHotel.provider,
              location: snap.tonightHotel.location,
            })}
          </p>
          {snap.tonightHotel.location ? (
            <p className="mt-0.5 text-[14px] text-[#6E6E73]">{snap.tonightHotel.location}</p>
          ) : null}
          <button
            type="button"
            onClick={() => onReservationTap?.(snap.tonightHotel!.id)}
            className="mt-2 text-[14px] font-semibold text-[#007AFF]"
          >
            View stay
          </button>
        </article>
      ) : null}

      {selectedDay ? (
        <DayDetailSheet
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
          onOpenPlan={onOpenPlan}
          onReservationTap={onReservationTap}
          onGapActionTap={onGapActionTap}
        />
      ) : null}
    </section>
  );
}

function weekStatus(days: DayReadiness[]): ReadinessStatus {
  if (days.some((d) => d.status === "problem")) return "problem";
  if (days.some((d) => d.status === "needs_you")) return "needs_you";
  if (days.some((d) => d.status === "watch")) return "watch";
  return "set";
}

function weekSummary(days: DayReadiness[]): string {
  const setCount = days.filter((d) => d.status === "set").length;
  const needCount = days.filter((d) => d.status === "needs_you" || d.status === "problem").length;
  if (needCount === 0) return `${setCount} of 7 days look set.`;
  return `${needCount} day${needCount === 1 ? "" : "s"} need you · ${setCount} set.`;
}

function DayDetailSheet({
  day,
  onClose,
  onOpenPlan,
  onReservationTap,
  onGapActionTap,
}: {
  day: DayReadiness;
  onClose: () => void;
  onOpenPlan: () => void;
  onReservationTap?: (id: string) => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
              {statusLabel(day.status)}
            </p>
            <h3 className="mt-1 text-[22px] font-semibold text-[#1D1D1F]">{day.label}</h3>
            <p className="mt-1 text-[15px] text-[#6E6E73]">{day.summary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full px-3 text-[15px] font-semibold text-[#007AFF]"
          >
            Close
          </button>
        </header>

        {day.flights.length > 0 ? (
          <section className="mt-4">
            <p className="text-[12px] font-bold uppercase text-[#6E6E73]">Flights</p>
            <ul className="mt-2 space-y-2">
              {day.flights.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onReservationTap?.(f.id)}
                    className="w-full rounded-2xl bg-[#F5F5F7] px-3 py-3 text-left text-[15px] font-medium text-[#1D1D1F]"
                  >
                    {f.flightNumber || "Flight"} · {f.flightDepartureAirport} → {f.flightArrivalAirport}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {day.hotels.length > 0 ? (
          <section className="mt-4">
            <p className="text-[12px] font-bold uppercase text-[#6E6E73]">Stay</p>
            <ul className="mt-2 space-y-2">
              {day.hotels.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onReservationTap?.(h.id)}
                    className="w-full rounded-2xl bg-[#F5F5F7] px-3 py-3 text-left text-[15px] font-medium text-[#1D1D1F]"
                  >
                    {reservationPropertyName({
                      type: "hotel",
                      title: h.title,
                      provider: h.provider,
                      location: h.location,
                    })}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {day.attention.length > 0 ? (
          <section className="mt-4">
            <p className="text-[12px] font-bold uppercase text-[#6E6E73]">Needs you</p>
            <ul className="mt-2 space-y-2">
              {day.attention.map((item) => (
                <li key={item.id} className="rounded-2xl bg-[#FFF4E5] px-3 py-3 text-[14px] text-[#1D1D1F]">
                  <p className="font-semibold">{item.title}</p>
                  {item.detail ? <p className="mt-1 text-[#6E6E73]">{item.detail}</p> : null}
                  {item.actionLabel ? (
                    <button
                      type="button"
                      className="mt-2 font-semibold text-[#007AFF]"
                      onClick={() => {
                        if (item.actionTab && onGapActionTap) {
                          onGapActionTap({ tab: item.actionTab, context: item.actionContext });
                        }
                        onClose();
                      }}
                    >
                      {item.actionLabel}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => {
            onOpenPlan();
            onClose();
          }}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] text-[17px] font-semibold text-white"
        >
          Open full day plan
        </button>
      </div>
    </div>
  );
}
