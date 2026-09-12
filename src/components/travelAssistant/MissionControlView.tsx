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
import { BriAirportCoachCompact } from "@/components/travelAssistant/BriAirportCoachCompact";
import { TrainTicketHandoffCard } from "@/components/travelAssistant/TrainTicketHandoffCard";
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
import {
  hasVerifiedLiveAirborneStatus,
  resolveAirborneHeroCopy,
} from "@/lib/travelAssistant/airborneLiveClaim";
import { formatFlightStatusTrustLine } from "@/lib/travelAssistant/flightStatusTrustLine";
import { resolveDayOfStatusChrome } from "@/lib/travelAssistant/dayOfStatusChrome";
import { resolveTripWalk } from "@/lib/travelAssistant/tripWalk";
import {
  buildTripReadinessSummary,
  detectScheduleCollisions,
  type ReadinessChecklistItem,
} from "@/lib/travelAssistant/tripOrchestration";
import { formatTravelDayFlightLabel } from "@/lib/travelAssistant/flightSort";
import {
  resolveAirportSpotlightForHome,
  resolveArrivalHotelLabel,
} from "@/lib/travelAssistant/airportSpotlightContext";
import {
  detectStrandedAtAirport,
  type StrandedDisruptionReason,
  type StrandedFlightState,
} from "@/lib/travelAssistant/strandedFlightDetector";
import { shouldClearStrandedOnRebook } from "@/lib/travelAssistant/strandedRebookIngest";
import { StrandedFlightPromptCard } from "@/components/travelAssistant/StrandedFlightPromptCard";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  buildHomeTodayCoach,
  homeTodayCoachNextAction,
  travelerTodayKey,
} from "@/lib/travelAssistant/homeTodayCoach";
import {
  formatTravelDayFlightLead,
  homeTravelDayCoachNextAction,
  isTrainFlightTravelDayPattern,
  resolveActiveTravelDayCoach,
  resolveEffectiveTravelTimezone,
} from "@/lib/travelAssistant/homeTravelDayCoach";
import {
  resolveTrainTicketsForDay,
  resolveTrainTicketOpenTarget,
  type TrainTicketSourceReservation,
} from "@/lib/travelAssistant/trainTicketHandoff";

export interface MissionControlLiveStatus {
  flightStatus?: string;
  delayMinutes?: number | null;
  departureGate?: string;
  onTime?: boolean | null;
  checkedAt?: string;
  busy?: boolean;
  error?: string | null;
  bookedStatus?: string;
  bookedGate?: string;
  pushStatus?: string;
  pushGate?: string;
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
  pushMessage?: string | null;
  onEnablePush?: () => void;
  onOpenBook: () => void;
  onOpenPlan: () => void;
  onOpenAirportMode: () => void;
  onStartNewTrip?: () => void;
  onImportFlights?: () => void;
  onReservationTap?: (id: string) => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onSeeAllAttention?: () => void;
  /** Pending review-queue items (Plan B — next-action when nothing else ranks higher). */
  unresolvedReviewCount?: number;
  onOpenReview?: () => void;
  /** G31 — persisted readiness checklist (More tab). */
  readinessChecklist?: ReadinessChecklistItem[];
  onOpenReadiness?: () => void;
  /** F17 — day-of doors: gate/status/bags/clubs provenance (UNVERIFIED hides countdown). */
  strandedFlight?: StrandedFlightState | null;
  onStrandedFlightChange?: (state: StrandedFlightState | null) => void;
  onForwardRebook?: () => void;
  /** G49 — booked stop ranges for today-first stay coach. */
  stopRanges?: StopDateRange[];
  /** IANA timezone for calendar-today while traveling (e.g. Europe/Rome). */
  travelerTimezone?: string | null;
  /** Trip id for honest train-ticket source-view handoff. */
  tripId?: string | null;
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
  pushMessage = null,
  onEnablePush,
  onOpenBook,
  onOpenPlan,
  onOpenAirportMode,
  onStartNewTrip,
  onImportFlights,
  onReservationTap,
  onGapActionTap,
  onSeeAllAttention,
  unresolvedReviewCount = 0,
  onOpenReview,
  readinessChecklist = [],
  onOpenReadiness,
  strandedFlight = null,
  onStrandedFlightChange,
  onForwardRebook,
  stopRanges = [],
  travelerTimezone = null,
  tripId = null,
}: MissionControlViewProps) {
  const passportComplete = readinessChecklist.find((item) => item.id === "ready-passport")?.complete ?? false;

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
        passportComplete,
        stopRanges,
        travelerTimezone,
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
      passportComplete,
      stopRanges,
      travelerTimezone,
    ],
  );

  const showTravelOps = shouldShowTravelOpsChrome(snap.daysUntilDeparture);
  const prepMode = !showTravelOps;

  const [zoom, setZoom] = useState<MissionControlZoom>("today");
  const [zoomTouched, setZoomTouched] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayReadiness | null>(null);
  const [localStranded, setLocalStranded] = useState<StrandedFlightState | null>(null);

  useEffect(() => {
    if (strandedFlight != null) return;
    try {
      const raw = localStorage.getItem(`kepi-stranded:${tripName}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StrandedFlightState;
      if (parsed?.reservationId) setLocalStranded(parsed);
    } catch {
      /* ignore corrupt storage */
    }
  }, [tripName, strandedFlight]);

  const effectiveStranded = strandedFlight ?? localStranded;
  const persistStranded = (state: StrandedFlightState | null) => {
    if (onStrandedFlightChange) {
      onStrandedFlightChange(state);
      return;
    }
    setLocalStranded(state);
    try {
      const key = `kepi-stranded:${tripName}`;
      if (state) localStorage.setItem(key, JSON.stringify(state));
      else localStorage.removeItem(key);
    } catch {
      /* storage full / private mode */
    }
  };

  useEffect(() => {
    if (zoomTouched) return;
    if (prepMode) setZoom("trip");
    else if (showTravelOps && snap.phase === "at_destination") setZoom("today");
  }, [prepMode, zoomTouched, showTravelOps, snap.phase]);

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
      passportComplete,
    });
  }, [
    reservations,
    snap.daysUntilDeparture,
    destination,
    completeness.flights,
    completeness.hotels,
    missingPriceCount,
    passportComplete,
  ]);

  const readinessSummary = useMemo(() => {
    if (!hasActiveTrip) return null;
    const collisions = detectScheduleCollisions(reservations);
    const gapAttentionCount = snap.attentionTop3.filter(
      (item) => item.status === "needs_you" || item.status === "problem",
    ).length;
    return buildTripReadinessSummary({
      tripLabel: destination?.trim() || tripName,
      checklistItems: readinessChecklist,
      gapAttentionCount,
      reviewCount: unresolvedReviewCount,
      entryItems: [],
      collisions,
    });
  }, [
    hasActiveTrip,
    reservations,
    snap.attentionTop3,
    destination,
    tripName,
    readinessChecklist,
    unresolvedReviewCount,
  ]);

  const atAirport =
    locationStatus === "at-airport" || locationStatus === "in-terminal";

  const nextFlightLive = snap.nextFlight ? liveStatus?.[snap.nextFlight.id] : undefined;

  const dayOfStatusChrome = useMemo(() => {
    if (!snap.nextFlight) return null;
    const flight = snap.nextFlight;
    return resolveDayOfStatusChrome({
      bookedStatus: nextFlightLive?.bookedStatus,
      liveStatus: nextFlightLive?.flightStatus,
      liveCheckedAt: nextFlightLive?.checkedAt,
      liveError: nextFlightLive?.error,
      pushStatus: nextFlightLive?.pushStatus,
      pushGate: nextFlightLive?.pushGate,
      bookedGate: flight.flightDepartureGate ?? nextFlightLive?.bookedGate,
      liveGate: nextFlightLive?.departureGate,
      departureIata: flight.flightDepartureAirport,
    });
  }, [snap.nextFlight, nextFlightLive]);

  const strandedDetection = useMemo(() => {
    if (!snap.nextFlight || journeyPhase?.kind === "airborne") {
      return { shouldPrompt: false, prompt: null as ReturnType<typeof detectStrandedAtAirport>["prompt"] };
    }
    const liveEnRoute = hasVerifiedLiveAirborneStatus(nextFlightLive);
    return detectStrandedAtAirport({
      flight: snap.nextFlight,
      locationStatus: locationStatus === "airborne" ? "away" : locationStatus,
      journeyAirborneForThisFlight: false,
      liveEnRoute,
      existingState: effectiveStranded,
    });
  }, [snap.nextFlight, journeyPhase, locationStatus, nextFlightLive, effectiveStranded]);

  useEffect(() => {
    if (!effectiveStranded) return;
    if (
      shouldClearStrandedOnRebook({
        stranded: effectiveStranded,
        reservations: reservations,
      })
    ) {
      persistStranded(null);
    }
  }, [reservations, effectiveStranded]);

  const handleStrandedConfirm = (reason: StrandedDisruptionReason) => {
    if (!strandedDetection.prompt) return;
    persistStranded({
      reservationId: strandedDetection.prompt.reservationId,
      detectedAt: effectiveStranded?.detectedAt ?? new Date().toISOString(),
      confirmed: true,
      reason,
    });
  };

  const handleStrandedDismiss = () => {
    if (!strandedDetection.prompt) return;
    persistStranded({
      reservationId: strandedDetection.prompt.reservationId,
      detectedAt: effectiveStranded?.detectedAt ?? new Date().toISOString(),
      dismissedAt: new Date().toISOString(),
    });
  };

  const handleStrandedMadeFlight = () => {
    persistStranded(null);
  };

  const arrivalHotelLabel = useMemo(() => {
    if (journeyPhase?.kind !== "just-landed") return null;
    const flight = journeyPhase.flight as MissionControlReservation;
    const dateKey =
      flight.flightDate?.slice(0, 10) ??
      flight.flightArrivalTime?.slice(0, 10) ??
      flight.localTime?.slice(0, 10) ??
      null;
    const hotels = reservations.filter((r) => r.type === "hotel");
    return resolveArrivalHotelLabel(hotels, dateKey);
  }, [journeyPhase, reservations]);

  const airportSpotlight = useMemo(
    () =>
      resolveAirportSpotlightForHome({
        journeyPhase,
        locationStatus,
        atAirport,
        openAirportMode: snap.openAirportMode,
        nextFlight: snap.nextFlight,
        reservations,
        liveDepartureGate: snap.nextFlight
          ? liveStatus?.[snap.nextFlight.id]?.departureGate
          : undefined,
        hotelLabel: arrivalHotelLabel,
      }),
    [
      journeyPhase,
      locationStatus,
      atAirport,
      snap.openAirportMode,
      snap.nextFlight,
      reservations,
      liveStatus,
      arrivalHotelLabel,
    ],
  );

  const showStrandedCard =
    strandedDetection.shouldPrompt && strandedDetection.prompt != null;

  const calendarTodayKey = useMemo(
    () => travelerTodayKey(Date.now(), travelerTimezone ?? snap.tonightHotel?.timezone ?? null),
    [travelerTimezone, snap.tonightHotel?.timezone],
  );

  const travelDayTimezone = resolveEffectiveTravelTimezone(
    reservations,
    travelerTimezone ?? snap.tonightHotel?.timezone ?? null,
  );

  const activeTravelDay = useMemo(() => {
    if (!showTravelOps) return null;
    if (journeyPhase?.kind === "airborne" || journeyPhase?.kind === "just-landed") return null;
    return resolveActiveTravelDayCoach({
      reservations,
      timezone: travelDayTimezone,
      tripId,
      flightLeaveByHint: snap.leaveByHint,
      atFlightDepartureAirport: atAirport,
    });
  }, [
    showTravelOps,
    journeyPhase?.kind,
    reservations,
    travelDayTimezone,
    tripId,
    snap.leaveByHint,
    atAirport,
  ]);

  const travelDayLead = Boolean(activeTravelDay);
  const travelDayCoach = activeTravelDay?.coach ?? null;
  const travelDayTrainsComplete = travelDayCoach?.trainsComplete ?? false;

  const effectiveNextFlight = useMemo(() => {
    if (travelDayCoach?.flight?.id) {
      const booked = reservations.find((row) => row.id === travelDayCoach.flight!.id);
      if (booked) {
        return {
          ...booked,
          flightNumber: travelDayCoach.flight.flightNumber,
          flightDepartureAirport: travelDayCoach.flight.flightDepartureAirport,
          flightArrivalAirport: travelDayCoach.flight.flightArrivalAirport,
          flightDepartureTime: travelDayCoach.flight.flightDepartureTime,
          flightArrivalTime: travelDayCoach.flight.flightArrivalTime,
          flightArrivalTerminal: travelDayCoach.flight.flightArrivalTerminal,
          confirmationCode: travelDayCoach.flight.confirmationCode ?? booked.confirmationCode,
        };
      }
    }
    if (
      travelDayLead &&
      isTrainFlightTravelDayPattern(
        reservations,
        travelerTodayKey(Date.now(), travelDayTimezone),
      ) &&
      snap.nextFlight
    ) {
      return snap.nextFlight;
    }
    return snap.nextFlight;
  }, [
    travelDayCoach?.flight,
    travelDayLead,
    reservations,
    travelDayTimezone,
    snap.nextFlight,
  ]);

  const todayCoach = useMemo(() => {
    if (!showTravelOps || snap.phase !== "at_destination") return null;
    if (journeyPhase?.kind === "airborne" || journeyPhase?.kind === "just-landed") return null;
    return buildHomeTodayCoach({
      reservations,
      stopRanges,
      timezone: travelerTimezone ?? snap.tonightHotel?.timezone ?? null,
    });
  }, [
    showTravelOps,
    snap.phase,
    journeyPhase?.kind,
    reservations,
    stopRanges,
    travelerTimezone,
    snap.tonightHotel,
  ]);

  const nextTravelDayTrainHandoffs = useMemo(() => {
    if (!todayCoach?.nextTravelMove) return [];
    return resolveTrainTicketsForDay(
      reservations as TrainTicketSourceReservation[],
      todayCoach.nextTravelMove.dateKey,
      tripId,
    );
  }, [todayCoach?.nextTravelMove, reservations, tripId]);

  const nextTravelDayTicketUrl = useMemo(() => {
    if (!todayCoach?.nextTravelMove?.reservationId) return null;
    const train = (reservations as TrainTicketSourceReservation[]).find(
      (row) => row.id === todayCoach.nextTravelMove!.reservationId,
    );
    if (!train) return null;
    return resolveTrainTicketOpenTarget(train, tripId)?.url ?? null;
  }, [todayCoach?.nextTravelMove, reservations, tripId]);

  const todayCoachAction = useMemo(
    () =>
      todayCoach
        ? homeTodayCoachNextAction(todayCoach, {
            hasTrainTicketHandoff: nextTravelDayTrainHandoffs.length > 0,
            ticketUrl: nextTravelDayTicketUrl,
          })
        : null,
    [todayCoach, nextTravelDayTrainHandoffs, nextTravelDayTicketUrl],
  );

  const travelDayCoachAction = useMemo(
    () =>
      travelDayCoach
        ? homeTravelDayCoachNextAction(travelDayCoach, {
            primaryTicketUrl: travelDayCoach.trainHandoffs[0]?.primaryActionUrl ?? null,
          })
        : null,
    [travelDayCoach],
  );

  const walk = useMemo(
    () =>
      resolveTripWalk({
        journeyPhase,
        locationStatus,
        openAirportMode: snap.openAirportMode,
        atAirport,
        attentionTop3: snap.attentionTop3,
        prepWatchItems,
        prepMode,
        unresolvedReviewCount,
        nextFlight: effectiveNextFlight,
        leaveByHint: travelDayCoach?.leaveCue ?? snap.leaveByHint,
        liveDepartureGate: effectiveNextFlight
          ? liveStatus?.[effectiveNextFlight.id]?.departureGate
          : undefined,
        storedDepartureGate: effectiveNextFlight?.flightDepartureGate,
        connectionCalm,
        airportSpotlight:
          travelDayCoach?.hasTrainBeforeFlight && !travelDayTrainsComplete
            ? null
            : airportSpotlight,
        strandedPrompt: showStrandedCard ? strandedDetection.prompt : null,
        todayCoach: travelDayCoachAction ?? todayCoachAction,
        stayLeaveCue: travelDayCoach?.leaveCue ?? todayCoach?.leaveCue ?? null,
      }),
    [
      journeyPhase,
      locationStatus,
      snap.openAirportMode,
      snap.attentionTop3,
      effectiveNextFlight,
      travelDayCoach?.leaveCue,
      snap.leaveByHint,
      atAirport,
      prepWatchItems,
      prepMode,
      unresolvedReviewCount,
      liveStatus,
      connectionCalm,
      airportSpotlight,
      travelDayCoach?.hasTrainBeforeFlight,
      travelDayTrainsComplete,
      showStrandedCard,
      strandedDetection.prompt,
      travelDayCoachAction,
      todayCoachAction,
      travelDayCoach?.leaveCue,
      todayCoach?.leaveCue,
    ],
  );
  const travelTakeover =
    (!travelDayLead || travelDayTrainsComplete) &&
    journeyPhase != null &&
    isTravelDayTakeover(journeyPhase, snap.openAirportMode || atAirport);

  // I36 — Wallet-grade travel day: one headline, one CTA, nothing else.
  if (travelTakeover) {
    const takeoverFlight = effectiveNextFlight;
    const gate = takeoverFlight ? liveStatus?.[takeoverFlight.id]?.departureGate : null;
    const routeLabel = takeoverFlight
      ? `${takeoverFlight.flightDepartureAirport ?? ""} → ${takeoverFlight.flightArrivalAirport ?? ""}`
      : snap.identityLabel;

    let eyebrow = snap.phase === "departure_day" ? "Today" : "Travel day";
    let title = (travelDayCoach?.leaveCue ?? snap.leaveByHint) || "You're traveling today";
    let detail: string | null =
      snap.phase === "departure_day" && takeoverFlight
        ? formatTravelDayFlightLabel(takeoverFlight)
        : routeLabel;
    let tone: "blue" | "green" = "blue";

    if (journeyPhase?.kind === "airborne") {
      const airborneLive = liveStatus?.[journeyPhase.onFlight.id];
      const airborneCopy = resolveAirborneHeroCopy(journeyPhase, airborneLive);
      eyebrow = airborneCopy.eyebrow;
      title = airborneCopy.title;
      detail = airborneCopy.detail;
    } else if (journeyPhase?.kind === "just-landed") {
      eyebrow = walk.next.eyebrow || "Just landed";
      title = walk.next.title;
      detail = walk.next.detail ?? (
        journeyPhase.landedMinutesAgo < 2
          ? "Just now"
          : `${journeyPhase.landedMinutesAgo} minutes ago`
      );
      tone = "green";
    } else if (walk.gateChange) {
      eyebrow = "Gate changed";
      title = `Gate changed to ${walk.gateChange.to}`;
      detail = `Was ${walk.gateChange.from}.`;
    } else if (atAirport) {
      eyebrow = walk.next.eyebrow || (locationStatus === "in-terminal" ? "In the terminal" : "At the airport");
      title = walk.next.title;
      detail =
        walk.next.detail ??
        (takeoverFlight
          ? `${takeoverFlight.flightNumber || "Flight"} · ${routeLabel}`
          : "Your next steps are on the airport map");
    } else if (travelDayCoach?.leaveCue ?? snap.leaveByHint) {
      title = travelDayCoach?.leaveCue ?? snap.leaveByHint ?? title;
      detail = gate
        ? `Gate ${gate} · ${routeLabel}`
        : takeoverFlight
          ? `${takeoverFlight.flightNumber || "Flight"} · ${routeLabel}`
          : detail;
    }

    const heroBg = tone === "green" ? "#34C759" : "#007AFF";
    const ctaText = tone === "green" ? "#1D1D1F" : "#007AFF";

    return (
      <section
        className="space-y-3"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
      >
        {showStrandedCard && strandedDetection.prompt ? (
          <StrandedFlightPromptCard
            prompt={strandedDetection.prompt}
            state={effectiveStranded}
            onConfirmMissed={handleStrandedConfirm}
            onDismiss={handleStrandedDismiss}
            onForwardRebook={() => onForwardRebook?.() ?? onOpenPlan()}
            onMadeFlight={handleStrandedMadeFlight}
          />
        ) : null}

        <article
          className="rounded-3xl px-5 py-8 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
          style={{ background: heroBg }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/70">{eyebrow}</p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-tight leading-tight">{title}</h2>
          {detail ? <p className="mt-2 text-[17px] text-white/85">{detail}</p> : null}
          {!travelDayLead && connectionCalm.kind === "conflict" && connectionCalm.line ? (
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
            {walk.next.ctaLabel}
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
  const stayCoachLead =
    !travelDayLead &&
    Boolean(todayCoach) &&
    zoom === "today" &&
    showTravelOps &&
    !prepMode;
  const activeSummary = travelDayLead && travelDayCoach
    ? `${travelDayCoach.dayLabel} — ${travelDayCoach.leadDetail}`
    : stayCoachLead && todayCoach?.nextTravelMove && !travelDayLead
    ? todayCoach.nextTravelMove
      ? `${todayCoach.nextTravelMove.dayLabel} — ${todayCoach.nextTravelMove.headline}. ${todayCoach.nextTravelMove.detail}`
      : [todayCoach.leadDetail, todayCoach.tomorrowDetail, todayCoach.transferHint]
          .filter(Boolean)
          .join(" ")
    : prepMode
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

  // G26: one TripWalk card — okay / next / leave-by / can-break.
  const nextAction = walk.next;

  const runNextAction = () => {
    if (nextAction.kind === "airport") {
      onOpenAirportMode();
      return;
    }
    if (nextAction.kind === "review") {
      (onOpenReview ?? onOpenPlan)();
      return;
    }
    if (nextAction.kind === "prep") {
      if (nextAction.prepHref && typeof window !== "undefined") {
        if (nextAction.prepHref.startsWith("/")) {
          window.location.assign(nextAction.prepHref);
        } else {
          window.open(nextAction.prepHref, "_blank", "noopener,noreferrer");
        }
        return;
      }
      onOpenPlan();
      return;
    }
    if (nextAction.kind === "flight" && nextAction.reservationId && onReservationTap) {
      onReservationTap(nextAction.reservationId);
      return;
    }
    if (nextAction.kind === "attention" && nextAction.attention) {
      const item = nextAction.attention;
      if (item.actionTab === "more" && onOpenReadiness) {
        onOpenReadiness();
        return;
      }
      if (item.reservationId && onReservationTap) {
        onReservationTap(item.reservationId);
        return;
      }
      if (item.actionTab && onGapActionTap) {
        onGapActionTap({ tab: item.actionTab, context: item.actionContext });
        return;
      }
      onOpenBook();
      return;
    }
    onOpenPlan();
  };

  const alsoAttention =
    nextAction.kind === "attention" && nextAction.attention
      ? heroAttention.filter((item) => item.id !== nextAction.attention!.id).slice(0, 2)
      : heroAttention.slice(0, 2);

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
          {travelDayLead && travelDayCoach
            ? travelDayCoach.headline
            : stayCoachLead && todayCoach
              ? todayCoach.leadTitle
              : heroTitle(activeStatus, zoom, {
                  day: snap.today,
                  daysUntil: snap.daysUntilDeparture,
                  prepMode,
                })}
        </h2>
        {travelDayLead && travelDayCoach && travelDayCoach.briAirportCoachSteps.length > 0 ? (
          <BriAirportCoachCompact steps={travelDayCoach.briAirportCoachSteps} />
        ) : null}
        {travelDayLead && travelDayCoach && !travelDayCoach.trainsComplete ? null : (
          <p className="mt-1 text-[15px] leading-relaxed text-[#6E6E73]">{activeSummary}</p>
        )}

        {!travelDayLead ? (
          <dl className="mt-3 space-y-2 rounded-xl bg-white px-3 py-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                Are you okay?
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-[#1D1D1F]">{walk.okay.line}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                What’s next?
              </dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-[#1D1D1F]">{walk.next.title}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                When do you leave?
              </dt>
              <dd className="mt-0.5 text-[15px] font-medium leading-snug text-[#1D1D1F]">
                {walk.leaveBy ??
                  (prepMode
                    ? "Not the leave window yet"
                    : stayCoachLead && todayCoach?.nextTravelMove
                      ? todayCoach.nextTravelMove.detail
                      : "No leave time on the trip yet")}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                What can break?
              </dt>
              <dd className="mt-0.5 text-[15px] font-medium leading-snug text-[#1D1D1F]">
                {walk.canBreak.length > 0
                  ? walk.canBreak.map((item) => item.title).join(" · ")
                  : "Nothing flagged"}
              </dd>
            </div>
          </dl>
        ) : null}

        {travelDayLead && travelDayCoach ? (
          <div className="mt-2 space-y-2">
            {travelDayCoach.leaveCue ? (
              <div className="rounded-xl bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Leave-by
                </p>
                <p className="mt-1 text-[16px] font-semibold text-[#1D1D1F]">{travelDayCoach.leaveCue}</p>
              </div>
            ) : null}
            {travelDayCoach.trainHandoffs.length > 0 && !travelDayCoach.trainsComplete ? (
              travelDayCoach.trainHandoffs.map((handoff) => (
                <TrainTicketHandoffCard
                  key={handoff.reservationId}
                  content={handoff}
                  eyebrow={`Travel day · ${travelDayCoach.dayLabel}`}
                />
              ))
            ) : null}
            {travelDayCoach.walkthroughSteps.length > 0 &&
            travelDayCoach.briAirportCoachSteps.length === 0 ? (
              <div className="rounded-xl bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Your travel day walkthrough
                </p>
                <ol className="mt-2 space-y-3">
                  {travelDayCoach.walkthroughSteps.map((step, index) => (
                    <li key={step.id} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10 text-[12px] font-bold text-[#007AFF]"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-snug text-[#1D1D1F]">{step.title}</p>
                        <p className="mt-0.5 text-[14px] leading-relaxed text-[#6E6E73]">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : travelDayCoach.briAirportCoachSteps.length === 0 && travelDayCoach.airportTransferHint ? (
              <div className="rounded-xl bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  After the train
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-[#1D1D1F]">
                  {travelDayCoach.airportTransferHint}
                </p>
              </div>
            ) : null}
            {travelDayCoach.flight ? (
              <button
                type="button"
                onClick={() => onReservationTap?.(travelDayCoach.flight!.id)}
                className="w-full rounded-xl bg-white px-3 py-3 text-left"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Flight today
                </p>
                <p className="mt-1 text-[16px] font-semibold leading-snug text-[#1D1D1F]">
                  {formatTravelDayFlightLead(travelDayCoach.flight)}
                </p>
              </button>
            ) : null}
            {travelDayCoach.arrivalStay ? (
              <article className="rounded-xl border border-[#007AFF]/15 bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#007AFF]">
                  Tonight
                </p>
                <p className="mt-1 text-[17px] font-semibold text-[#1D1D1F]">
                  {travelDayCoach.arrivalStay.propertyName}
                </p>
                {travelDayCoach.arrivalStay.address ? (
                  <p className="mt-0.5 text-[14px] leading-relaxed text-[#6E6E73]">
                    {travelDayCoach.arrivalStay.address}
                  </p>
                ) : travelDayCoach.arrivalStay.city ? (
                  <p className="mt-0.5 text-[14px] text-[#6E6E73]">{travelDayCoach.arrivalStay.city}</p>
                ) : null}
                <p className="mt-2 text-[14px] leading-relaxed text-[#6E6E73]">
                  {travelDayCoach.arrivalStay.detail}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {travelDayCoach.arrivalStay.mapsUrl ? (
                    <a
                      href={travelDayCoach.arrivalStay.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[14px] font-semibold text-[#007AFF]"
                    >
                      Get directions
                    </a>
                  ) : null}
                  {travelDayCoach.arrivalStay.phoneTelHref ? (
                    <a
                      href={travelDayCoach.arrivalStay.phoneTelHref}
                      className="text-[14px] font-semibold text-[#007AFF]"
                    >
                      Call property
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onReservationTap?.(travelDayCoach.arrivalStay!.reservationId)}
                    className="text-[14px] font-semibold text-[#007AFF]"
                  >
                    View stay
                  </button>
                </div>
              </article>
            ) : null}
          </div>
        ) : null}

        {stayCoachLead && todayCoach?.nextTravelMove && !travelDayLead ? (
          <div className="mt-3 space-y-2">
            {nextTravelDayTrainHandoffs.length > 0 ? (
              nextTravelDayTrainHandoffs.map((handoff) => (
                <TrainTicketHandoffCard
                  key={handoff.reservationId}
                  content={handoff}
                  eyebrow={`Next travel day · ${todayCoach.nextTravelMove!.dayLabel}`}
                />
              ))
            ) : todayCoach.nextTravelMove.kind === "train" ? (
              <div className="rounded-xl bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Next travel day · {todayCoach.nextTravelMove.dayLabel}
                </p>
                <p className="mt-1 text-[16px] font-semibold text-[#1D1D1F]">
                  {todayCoach.nextTravelMove.headline}
                </p>
                <p className="mt-1 text-[14px] text-[#6E6E73]">{todayCoach.nextTravelMove.detail}</p>
                <p className="mt-2 text-[13px] text-[#6E6E73]">
                  Train is booked — forward your ticket email to open it from Home.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-white px-3 py-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Next travel day · {todayCoach.nextTravelMove.dayLabel}
                </p>
                <p className="mt-1 text-[16px] font-semibold text-[#1D1D1F]">
                  {todayCoach.nextTravelMove.headline}
                </p>
                <p className="mt-1 text-[14px] text-[#6E6E73]">{todayCoach.nextTravelMove.detail}</p>
              </div>
            )}
          </div>
        ) : null}

        {showTravelOps && !travelDayLead && connectionCalm.line ? (
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
            {pushMessage && !pushMessage.startsWith("✅") ? (
              <p className="mt-2 text-[13px] leading-relaxed text-[#C93400]">{pushMessage}</p>
            ) : null}
          </div>
        ) : null}

        {showTravelOps && pushSubscribed ? (
          <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-[13px] font-medium text-[#1D1D1F]">
            Flight alerts on — we&apos;ll notify you on gate changes and delays.
          </p>
        ) : null}

        {showTravelOps && dayOfStatusChrome?.banner ? (
          <div
            className={`mt-3 rounded-xl px-3 py-3 text-left ${
              dayOfStatusChrome.banner.kind === "cancel"
                ? "bg-rose-50 ring-1 ring-rose-200"
                : "bg-amber-50 ring-1 ring-amber-200"
            }`}
            data-testid="day-of-status-banner"
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#C93400]">
              {dayOfStatusChrome.banner.title}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#1D1D1F]">
              {dayOfStatusChrome.banner.body}
            </p>
          </div>
        ) : null}

        {showTravelOps &&
        !travelDayLead &&
        effectiveNextFlight &&
        (zoom === "today" || snap.phase === "departure_day" || stayCoachLead) ? (
          <button
            type="button"
            onClick={() => onReservationTap?.(effectiveNextFlight!.id)}
            className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-left"
          >
            <p className="text-[13px] font-semibold text-[#6E6E73]">
              {stayCoachLead ? "Next flight" : "Next flight"}
            </p>
            <p className="mt-0.5 text-[16px] font-semibold leading-snug text-[#1D1D1F]">
              {travelDayCoach?.flight
                ? formatTravelDayFlightLead(travelDayCoach.flight)
                : [
                    effectiveNextFlight.flightNumber,
                    effectiveNextFlight.flightDepartureAirport &&
                      effectiveNextFlight.flightArrivalAirport
                      ? `${effectiveNextFlight.flightDepartureAirport} → ${effectiveNextFlight.flightArrivalAirport}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Flight"}
            </p>
            <p className="mt-1 text-[14px] text-[#007AFF]">
              {formatFlightStatusTrustLine({
                ...(effectiveNextFlight.id === snap.nextFlight?.id ? nextFlightLive : undefined),
                bookedGate: effectiveNextFlight.flightDepartureGate,
                bookedStatus:
                  effectiveNextFlight.id === snap.nextFlight?.id
                    ? nextFlightLive?.bookedStatus
                    : undefined,
                departureIata: effectiveNextFlight.flightDepartureAirport,
              })}
            </p>
            {dayOfStatusChrome?.badge && !dayOfStatusChrome.banner ? (
              <p
                className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                  dayOfStatusChrome.badge.tone === "urgent"
                    ? "bg-rose-100 text-rose-800"
                    : dayOfStatusChrome.badge.tone === "watch"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-[#E8F2FF] text-[#007AFF]"
                }`}
                data-testid="day-of-status-badge"
              >
                {dayOfStatusChrome.badge.label}
              </p>
            ) : null}
          </button>
        ) : null}

        {readinessSummary && prepMode ? (
          <div className="mt-4 rounded-2xl bg-white px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
              Trip readiness
            </p>
            <p className="mt-1 text-[20px] font-semibold leading-snug tracking-tight text-[#1D1D1F]">
              {readinessSummary.headline}
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-[#6E6E73]">{readinessSummary.detail}</p>
            {readinessSummary.totalEssentials > 0 ? (
              <p className="mt-2 text-[13px] text-[#6E6E73]">
                {readinessSummary.completedEssentials} of {readinessSummary.totalEssentials} essentials checked
              </p>
            ) : null}
            {onOpenReadiness && readinessSummary.level !== "ready" ? (
              <button
                type="button"
                onClick={onOpenReadiness}
                className="mt-3 min-h-[44px] text-[15px] font-semibold text-[#007AFF]"
              >
                Open checklist
              </button>
            ) : null}
          </div>
        ) : null}

        {!(travelDayLead || (stayCoachLead && todayCoach?.nextTravelMove)) ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-4 ${
            nextAction.kind === "ready"
              ? "bg-white"
              : nextAction.kind === "airport" || nextAction.kind === "attention"
                ? "bg-white ring-1 ring-[#007AFF]/25"
                : "bg-white"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#007AFF]">
            {nextAction.eyebrow}
          </p>
          <p className="mt-1 text-[20px] font-semibold leading-snug tracking-tight text-[#1D1D1F]">
            {nextAction.title}
          </p>
          {nextAction.detail ? (
            <p className="mt-1 text-[14px] leading-relaxed text-[#6E6E73]">{nextAction.detail}</p>
          ) : null}
          <button
            type="button"
            onClick={runNextAction}
            className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white"
          >
            {nextAction.ctaLabel}
          </button>
        </div>
        ) : null}

        {alsoAttention.length > 0 ? (
          <div className="mt-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6E6E73]">Also</p>
            <ul className="mt-1.5 space-y-2">
              {alsoAttention.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.reservationId && onReservationTap) {
                        onReservationTap(item.reservationId);
                        return;
                      }
                      if (item.actionTab && onGapActionTap) {
                        onGapActionTap({ tab: item.actionTab, context: item.actionContext });
                        return;
                      }
                      onOpenPlan();
                    }}
                    className="flex w-full items-start gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-left text-[14px] text-[#1D1D1F]"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: statusColor(item.status) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.title}</p>
                      {item.detail ? (
                        <p className="mt-0.5 text-[13px] text-[#6E6E73]">{item.detail}</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {prepMode && prepWatchItems.length > 1 ? (
          <ul className="mt-3 space-y-2">
            {prepWatchItems.slice(1).map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white/80 px-3 py-2.5 text-[14px] text-[#1D1D1F]"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[13px] text-[#6E6E73]">{item.detail}</p>
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

      {snap.tonightHotel &&
      (snap.phase === "at_destination" || snap.phase === "departure_day") &&
      !stayCoachLead &&
      !travelDayCoach?.arrivalStay ? (
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
          tripId={tripId}
          reservations={reservations as TrainTicketSourceReservation[]}
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
  tripId,
  reservations,
  onClose,
  onOpenPlan,
  onReservationTap,
  onGapActionTap,
}: {
  day: DayReadiness;
  tripId?: string | null;
  reservations: TrainTicketSourceReservation[];
  onClose: () => void;
  onOpenPlan: () => void;
  onReservationTap?: (id: string) => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
}) {
  const trainTicketHandoffs = resolveTrainTicketsForDay(reservations, day.dateKey, tripId);

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

        {trainTicketHandoffs.length > 0 ? (
          <section className="mt-4 space-y-2">
            {trainTicketHandoffs.map((handoff) => (
              <TrainTicketHandoffCard key={handoff.reservationId} content={handoff} />
            ))}
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
