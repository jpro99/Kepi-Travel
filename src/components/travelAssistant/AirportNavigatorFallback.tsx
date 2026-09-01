"use client";

import { useEffect, useMemo, useState } from "react";
import type { TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { getAirportProximity } from "@/lib/travelAssistant/airportGeo";
import { buildGateInstructions, getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import type { FamilyAirportPin } from "@/lib/family/familyAirportPins";
import { OfficialAirportMapLink } from "@/components/travelAssistant/OfficialAirportMapLink";
import {
  getAirportWayfindingResource,
  wayfindingHonestyTier,
} from "@/lib/airportNav/officialWayfinding";
import {
  buildArrivalDayCoachPath,
  buildDepartDayCoachPath,
  departureTimeBudgetReassurance,
  deriveAirportDayCoachMode,
  formatLiveBaggageCarouselNote,
  resolveArrivalSpotlightIndex,
  resolveDepartSpotlightIndex,
  selectDayCoachVisibleSteps,
  type AirportDayCoachMode,
  type DayCoachPathStep,
} from "@/lib/travelAssistant/airportDayCoach";
import { buildDepartLeaveTimingCopy } from "@/lib/travelAssistant/departLeaveTiming";
import { resolveAirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";
import { ArrivalTransportOptionsCard } from "@/components/travelAssistant/ArrivalTransportOptionsCard";
import { GateConfidenceBar } from "@/components/travelAssistant/GateConfidenceBar";
import { ArrivalCardStack } from "@/components/travelAssistant/ArrivalCardStack";
import { resolveArrivalTransportPresentation } from "@/lib/travelAssistant/arrivalTransportPresentation";
import { buildRideFromAirportDeepLinks } from "@/lib/travelAssistant/groundTransportDeepLinks";
import {
  buildArrivalCoachCards,
  computeArrivalGateConfidence,
  computeDepartGateConfidence,
} from "@/lib/airportNav/gateConfidence";
import {
  computeConnectionGateConfidence,
  estimateSeaConnectionWalkMinutes,
  isHubConnectionActive,
  resolveHubConnection,
} from "@/lib/airportNav/connectionClock";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

interface AirportNavigatorFallbackProps {
  iata: string;
  gateCode: string | null;
  airlineName: string | null;
  flightNumber?: string | null;
  arrivalAirport?: string | null;
  departureAirport?: string | null;
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  departureClockLabel?: string | null;
  flightStatusLabel?: string | null;
  flightDelayed?: boolean;
  minutesToDeparture: number;
  /** Parent-derived: journeyPhase just-landed → arrive. */
  coachMode?: AirportDayCoachMode;
  landedMinutesAgo?: number | null;
  hotelLabel?: string | null;
  hotelDropoff?: { label: string; lat: number; lon: number } | null;
  /** YYYY-MM-DD for live baggage lookup on arrive. */
  flightDate?: string | null;
  /** Scheduled arrival local time for first-mile schedule logic. */
  flightArrivalTime?: string | null;
  flightTimezone?: string | null;
  proximityStatus?: string;
  userLat: number | null;
  userLon: number | null;
  credentials: TravelerSecurityCredentials;
  eligibleLoungeNames?: string[];
  fill?: boolean;
  onSwitchToFamilyView?: () => void;
  /** Parent-owned: show every path step vs coach (current + next). */
  fullDayView?: boolean;
  onToggleFullDayView?: () => void;
  /** True when layout API failed (not merely unsupported). */
  layoutLoadFailed?: boolean;
  familyPins?: FamilyAirportPin[];
  onFamilyPinTap?: (memberId: string) => void;
  tripReservations?: readonly TransportRouteReservation[];
  activeReservationId?: string | null;
}

function proximityLabel(status: string): string {
  if (status === "in-terminal") return "Inside the terminal area (GPS)";
  if (status === "at-airport") return "At the airport (GPS)";
  if (status === "away") return "Not at the airport yet";
  return "Locating…";
}

export function AirportNavigatorFallback({
  iata,
  gateCode,
  airlineName,
  flightNumber,
  arrivalAirport,
  departureAirport,
  departureTerminal,
  arrivalTerminal,
  departureClockLabel,
  flightStatusLabel,
  flightDelayed = false,
  minutesToDeparture,
  coachMode = "depart",
  landedMinutesAgo = null,
  hotelLabel = null,
  hotelDropoff = null,
  flightDate = null,
  flightArrivalTime = null,
  flightTimezone = null,
  proximityStatus = "away",
  userLat,
  userLon,
  credentials,
  eligibleLoungeNames = [],
  fill = false,
  onSwitchToFamilyView,
  fullDayView = false,
  onToggleFullDayView,
  layoutLoadFailed = false,
  familyPins = [],
  onFamilyPinTap,
  tripReservations,
  activeReservationId = null,
}: AirportNavigatorFallbackProps) {
  const code = iata.trim().toUpperCase();
  const isArrive = coachMode === "arrive";
  const [liveBaggageClaim, setLiveBaggageClaim] = useState<string | null>(null);
  const [driveMinutes, setDriveMinutes] = useState<number | null>(null);
  const nav = getAirportNav(code);

  useEffect(() => {
    if (!isArrive) {
      setLiveBaggageClaim(null);
      return;
    }
    const number = flightNumber?.trim();
    const date = (flightDate?.trim() ?? "").slice(0, 10);
    const airline = airlineName?.trim() || "Airline";
    if (!number || !date || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return;

    let cancelled = false;
    const params = new URLSearchParams({
      action: "flight-lookup",
      flightNumber: number,
      airline,
      flightDate: date,
    });
    void fetch(`/api/travel-updates?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { baggageClaim?: string } | null) => {
        if (cancelled) return;
        const claim = payload?.baggageClaim?.trim() ?? "";
        setLiveBaggageClaim(claim || null);
      })
      .catch(() => {
        if (!cancelled) setLiveBaggageClaim(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isArrive, flightNumber, flightDate, airlineName]);
  const officialWayfinding = getAirportWayfindingResource(code);
  const wayfindingTier = wayfindingHonestyTier(officialWayfinding);
  const strongOfficial = wayfindingTier === "strong";

  const proximity = useMemo(
    () => getAirportProximity(userLat, userLon, code),
    [userLat, userLon, code],
  );

  const guide = useMemo(
    () =>
      buildGateInstructions(
        code,
        gateCode ?? undefined,
        departureTerminal ?? undefined,
        credentials.clear,
        credentials.tsaPreCheck,
        false,
      ),
    [code, gateCode, departureTerminal, credentials.clear, credentials.tsaPreCheck],
  );

  const pathSteps = useMemo((): DayCoachPathStep[] => {
    if (isArrive) {
      return buildArrivalDayCoachPath({
        iata: code,
        flightNumber,
        airlineName,
        departureIata: departureAirport,
        arrivalTerminal,
        hotelLabel,
        baggageCarouselNote: formatLiveBaggageCarouselNote(liveBaggageClaim),
        flightArrivalTime,
        flightTimezone,
        landedMinutesAgo,
      });
    }
    return buildDepartDayCoachPath({
      iata: code,
      airlineName,
      flightNumber,
      gateCode,
      departureTerminal,
      credentials: { tsaPreCheck: credentials.tsaPreCheck, clear: credentials.clear },
      eligibleLoungeNames,
    });
  }, [
    isArrive,
    code,
    flightNumber,
    airlineName,
    departureAirport,
    arrivalTerminal,
    hotelLabel,
    liveBaggageClaim,
    flightArrivalTime,
    flightTimezone,
    landedMinutesAgo,
    gateCode,
    departureTerminal,
    credentials.tsaPreCheck,
    credentials.clear,
    eligibleLoungeNames,
    guide,
  ]);

  const spotlightIndex = useMemo(() => {
    if (isArrive) {
      return resolveArrivalSpotlightIndex({
        steps: pathSteps,
        landedMinutesAgo,
        locationStatus: proximityStatus || proximity.status,
        hasLiveBaggage: Boolean(formatLiveBaggageCarouselNote(liveBaggageClaim)),
      });
    }
    const deptUtc = Date.now() + minutesToDeparture * 60_000;
    const phase = resolveAirportLocationPhase({
      departureUtcMs: deptUtc,
      nowMs: Date.now(),
      locationStatus: proximityStatus || proximity.status,
      hasLoungeAccess: (eligibleLoungeNames?.length ?? 0) > 0,
    });
    return resolveDepartSpotlightIndex(pathSteps, phase);
  }, [
    isArrive,
    pathSteps,
    landedMinutesAgo,
    proximityStatus,
    proximity.status,
    liveBaggageClaim,
    minutesToDeparture,
    eligibleLoungeNames,
  ]);

  const { visible: visiblePathSteps, hiddenCount } = useMemo(
    () => selectDayCoachVisibleSteps(pathSteps, fullDayView, spotlightIndex),
    [pathSteps, fullDayView, spotlightIndex],
  );


  // Depart leave-by: real OSRM drive minutes when GPS is available (honest route estimate).
  useEffect(() => {
    if (isArrive) {
      setDriveMinutes(null);
      return;
    }
    if (userLat == null || userLon == null) {
      setDriveMinutes(null);
      return;
    }
    if (proximityStatus === "in-terminal" || proximityStatus === "at-airport") {
      setDriveMinutes(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      iata: code,
      lat: String(userLat),
      lon: String(userLon),
    });
    void fetch(`/api/drive-eta?${params.toString()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { driveMinutes?: number } | null) => {
        if (cancelled) return;
        const mins = payload?.driveMinutes;
        setDriveMinutes(
          typeof mins === "number" && Number.isFinite(mins) && mins > 0 ? Math.round(mins) : null,
        );
      })
      .catch(() => {
        if (!cancelled) setDriveMinutes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isArrive, code, userLat, userLon, proximityStatus]);

  const leaveTiming = useMemo(
    () =>
      isArrive
        ? null
        : buildDepartLeaveTimingCopy({
            minutesToDeparture,
            departureIata: code,
            arrivalIata: arrivalAirport,
            departureTimezone: flightTimezone,
            driveMinutes,
            driveSource: driveMinutes != null ? "route" : null,
          }),
    [isArrive, minutesToDeparture, code, arrivalAirport, flightTimezone, driveMinutes],
  );
  const timeBudgetLine = isArrive
    ? null
    : leaveTiming?.leaveByLine ?? departureTimeBudgetReassurance(minutesToDeparture);
  const rideLinks = useMemo(
    () => (isArrive ? buildRideFromAirportDeepLinks(code, hotelDropoff) : null),
    [isArrive, code, hotelDropoff],
  );
  const arrivalTransportPresentation = useMemo(
    () =>
      isArrive
        ? resolveArrivalTransportPresentation({
            iata: code,
            flightArrivalTime,
            flightTimezone,
            landedMinutesAgo,
            hotelLabel,
          })
        : null,
    [isArrive, code, flightArrivalTime, flightTimezone, landedMinutesAgo, hotelLabel],
  );
  const arrivalTransportOptions = arrivalTransportPresentation?.transportOptions ?? nav?.arrivalInfo?.transportOptions ?? [];
  const nextUp = visiblePathSteps[0] ?? null;

  const gateConfidence = useMemo(() => {
    const currentStep = pathSteps[spotlightIndex] ?? pathSteps[0] ?? null;
    const connectionCtx =
      tripReservations && activeReservationId
        ? resolveHubConnection(tripReservations, code, activeReservationId)
        : null;
    const useConnectionClock =
      connectionCtx &&
      connectionCtx.hubIata === code &&
      isHubConnectionActive(connectionCtx);

    if (useConnectionClock && connectionCtx) {
      const walk = estimateSeaConnectionWalkMinutes({
        arrivalGate: connectionCtx.inbound.arrivalGate,
        departureGate: connectionCtx.outbound.departureGate ?? gateCode,
        arrivalTerminal: connectionCtx.inbound.arrivalTerminal,
        departureTerminal: connectionCtx.outbound.departureTerminal ?? departureTerminal,
        credentials: { tsaPreCheck: credentials.tsaPreCheck, clear: credentials.clear },
      });
      return computeConnectionGateConfidence({
        ctx: connectionCtx,
        minutesToOutboundDeparture: minutesToDeparture,
        landedMinutesAgo,
        locationStatus: proximityStatus,
        throughSecurity: proximityStatus === "in-terminal",
        credentials: { tsaPreCheck: credentials.tsaPreCheck, clear: credentials.clear },
        walkMinutes: walk.minutes,
        walkKnown: walk.known,
      });
    }

    if (isArrive) {
      const remainingWalk = pathSteps
        .slice(spotlightIndex)
        .reduce((sum, step) => sum + (step.minutes ?? 0), 0);
      return computeArrivalGateConfidence({
        iata: code,
        flightArrivalTime,
        flightTimezone,
        landedMinutesAgo,
        hotelLabel,
        currentStep,
        remainingWalkMinutes: remainingWalk,
      });
    }
    return computeDepartGateConfidence({
      iata: code,
      minutesToDeparture,
      walkToGateSeconds: null,
      throughSecurity: proximityStatus === "in-terminal",
      securityWaitSeconds: proximityStatus === "in-terminal" ? 0 : 12 * 60,
      currentStep,
      arrivalAirport,
      departureTimezone: flightTimezone,
    });
  }, [
    isArrive,
    pathSteps,
    spotlightIndex,
    code,
    tripReservations,
    activeReservationId,
    gateCode,
    departureTerminal,
    flightArrivalTime,
    flightTimezone,
    landedMinutesAgo,
    hotelLabel,
    minutesToDeparture,
    proximityStatus,
    arrivalAirport,
    credentials.tsaPreCheck,
    credentials.clear,
  ]);

  const arrivalCoachCards = useMemo(() => {
    if (!isArrive) return [];
    return buildArrivalCoachCards({
      steps: pathSteps,
      iata: code,
      scheduleNote: arrivalTransportPresentation?.scheduleNote,
      transportOptions: arrivalTransportPresentation?.transportOptions,
    });
  }, [isArrive, pathSteps, code, arrivalTransportPresentation]);

  const flightCoachLabel = [airlineName, flightNumber].filter(Boolean).join(" ") || null;

  return (
    <div
      data-testid="airport-nav-fallback"
      className={
        fill
          ? "relative flex h-full w-full flex-col overflow-y-auto bg-gradient-to-b from-[#0b1f3a] to-[#061528] text-white"
          : "relative overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-b from-[#0b1f3a] to-[#061528] text-white"
      }
      style={fill ? undefined : { maxHeight: 520 }}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="relative rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3">
          {onToggleFullDayView ? (
            <button
              type="button"
              data-testid="airport-fallback-day-view-toggle"
              onClick={onToggleFullDayView}
              className="absolute right-3 top-3 rounded-lg border border-sky-400/30 bg-transparent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200/90 active:opacity-80"
            >
              {fullDayView ? "Coach view" : "Full day view"}
            </button>
          ) : null}
          <p
            className={`text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200 ${
              onToggleFullDayView ? "pr-24" : ""
            }`}
          >
            {isArrive
              ? "Just landed · arrival coach"
              : layoutLoadFailed
                ? "Kepi terminal map temporarily unavailable"
                : strongOfficial
                  ? "Kepi checklist · official live map below"
                  : "Your guide for this airport"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-sky-50/95">
            {isArrive ? (
              <>
                Kepi coaches the arrivals process for <span className="font-bold">{code}</span> — bags, exit,
                and ride. This is not indoor GPS; follow airport signs and open the official map below.
              </>
            ) : layoutLoadFailed ? (
              <>
                We couldn&apos;t load Kepi&apos;s terminal map for <span className="font-bold">{code}</span> right now.
                Use the checklist below — we&apos;ll retry when you reopen the map.
              </>
            ) : strongOfficial ? (
              <>
                Kepi keeps your trip context for <span className="font-bold">{code}</span>. Open the verified
                live indoor map below for turn-by-turn inside the terminal.
              </>
            ) : (
              <>
                Follow this checklist for <span className="font-bold">{code}</span> — check-in, security, gate.
                Kepi&apos;s stored terminal map will appear here once this airport is published; until then
                trust posted signs and staff over any web venue search.
              </>
            )}
          </p>
        </div>

        {/* Strong verified indoor maps go first; weak Google fallbacks go AFTER the checklist
            so they never look like the primary tool. */}
        {strongOfficial ? <OfficialAirportMapLink iata={code} /> : null}

        {isArrive && arrivalCoachCards.length > 0 ? (
          <ArrivalCardStack
            cards={arrivalCoachCards}
            activeIndex={spotlightIndex}
            iata={code}
            flightLabel={flightCoachLabel}
            uberUrl={rideLinks?.uberUrl}
            hotelLabel={hotelLabel}
          />
        ) : !isArrive ? (
          <GateConfidenceBar
            confidence={gateConfidence}
            iata={code}
            flightLabel={flightCoachLabel}
          />
        ) : null}

        <div className="rounded-2xl bg-black/35 px-4 py-3 backdrop-blur" data-testid={isArrive ? "airport-nav-fallback-arrive" : "airport-nav-fallback-depart"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">
                {isArrive ? `Just landed · ${code}` : `${nav?.name ?? code} · ${code}`}
              </p>
              {isArrive ? (
                <>
                  <p className="mt-1 text-xl font-black">
                    {flightNumber?.trim() || "Arrived"}
                    {arrivalTerminal ? (
                      <span className="ml-2 text-sm font-semibold text-sky-200/80">Term {arrivalTerminal}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-300">
                    {departureAirport ? `${departureAirport} → ${code}` : code}
                    {typeof landedMinutesAgo === "number"
                      ? landedMinutesAgo < 2
                        ? " · just now"
                        : ` · ${landedMinutesAgo}m ago`
                      : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xl font-black">
                    Gate {gateCode?.toUpperCase() ?? "TBD"}
                    {departureTerminal ? (
                      <span className="ml-2 text-sm font-semibold text-sky-200/80">Term {departureTerminal}</span>
                    ) : null}
                  </p>
                  {flightNumber ? (
                    <p className="mt-0.5 text-sm text-slate-300">
                      {flightNumber}
                      {arrivalAirport ? ` → ${arrivalAirport}` : ""}
                      {departureClockLabel ? ` · ${departureClockLabel}` : ""}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {!isArrive ? (
              <div className="text-right">
                <p className={`text-lg font-black ${minutesToDeparture < 45 ? "text-amber-300" : "text-white"}`}>
                  {minutesToDeparture > 0 ? `${Math.round(minutesToDeparture)}m` : "Now"}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">to departure</p>
                {flightStatusLabel ? (
                  <p className={`mt-1 text-xs font-bold ${flightDelayed ? "text-amber-300" : "text-emerald-300"}`}>
                    {flightStatusLabel}
                  </p>
                ) : null}
              </div>
            ) : flightStatusLabel ? (
              <div className="text-right">
                <p className={`text-xs font-bold ${flightDelayed ? "text-amber-300" : "text-emerald-300"}`}>
                  {flightStatusLabel}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-sky-100/80">
            📍 {proximityLabel(proximityStatus || proximity.status)}
          </p>
          {timeBudgetLine || leaveTiming?.urgencyLine || leaveTiming?.driveLine ? (
            <div
              data-testid="airport-fallback-leave-timing"
              className="mt-3 space-y-1.5 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2.5"
            >
              {leaveTiming?.urgencyLine ? (
                <p data-testid="airport-fallback-leave-urgency" className="text-sm font-bold text-amber-200">
                  {leaveTiming.urgencyLine}
                </p>
              ) : null}
              {timeBudgetLine ? (
                <p data-testid="airport-fallback-time-budget" className="text-[12px] font-semibold text-sky-100/95">
                  {timeBudgetLine}
                </p>
              ) : null}
              {leaveTiming?.driveLine ? (
                <p data-testid="airport-fallback-drive-line" className="text-[11px] text-sky-100/80">
                  {leaveTiming.driveLine}
                </p>
              ) : null}
              {leaveTiming?.leaveNowEtaLine ? (
                <p data-testid="airport-fallback-leave-now-eta" className="text-[12px] font-semibold text-emerald-200">
                  {leaveTiming.leaveNowEtaLine}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {nextUp && !(isArrive && arrivalCoachCards.length > 0) ? (
          <section
            data-testid="airport-fallback-next-up"
            className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Next up</p>
            <p className="mt-1 text-lg font-black text-white">{nextUp.text}</p>
            {nextUp.detail ? <p className="mt-1 text-sm text-sky-100/85">{nextUp.detail}</p> : null}
          </section>
        ) : null}

        <section className={isArrive && arrivalCoachCards.length > 0 ? "hidden" : undefined}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/80">Your path today</p>
          <ol className="mt-2 space-y-2">
            {visiblePathSteps.map((step, index) => (
              <li
                key={step.id}
                className={`flex gap-3 rounded-xl px-3 py-2.5 ${
                  index === 0 && !fullDayView ? "bg-sky-500/20 ring-1 ring-sky-400/30" : "bg-white/5"
                }`}
              >
                <span className="text-lg" aria-hidden>{step.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{step.text}</p>
                  {step.detail ? <p className="text-xs text-slate-400">{step.detail}</p> : null}
                  {step.minutes != null && step.minutes > 0 ? (
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      ~{step.minutes} min
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
            {hiddenCount > 0 ? (
              <li
                data-testid="airport-fallback-more-steps"
                className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2.5 text-xs font-semibold text-sky-100/85"
              >
                {hiddenCount} more step{hiddenCount === 1 ? "" : "s"}
                {onToggleFullDayView ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={onToggleFullDayView}
                      className="underline decoration-sky-400/50 underline-offset-2"
                    >
                      Full day view
                    </button>
                  </>
                ) : null}
              </li>
            ) : null}
          </ol>
          {!isArrive && guide.totalMinutes > 0 ? (
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Estimated {guide.totalMinutes} min after you&apos;re at security
            </p>
          ) : null}
        </section>

        {!strongOfficial ? <OfficialAirportMapLink iata={code} /> : null}

        {isArrive && arrivalTransportOptions.length > 0 && arrivalCoachCards.length === 0 ? (
          <ArrivalTransportOptionsCard
            options={arrivalTransportOptions}
            uberUrl={rideLinks?.uberUrl}
            hotelLabel={hotelLabel}
            scheduleNote={arrivalTransportPresentation?.scheduleNote}
          />
        ) : isArrive && rideLinks ? (
          <a
            data-testid="airport-fallback-uber"
            href={rideLinks.uberUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-2xl bg-[#f4c95d] px-4 py-3.5 text-center text-sm font-bold text-[#0b1f3a] shadow-lg active:opacity-90"
          >
            {hotelLabel?.trim() ? `Call Uber to ${hotelLabel.trim()}` : "Call Uber from airport"}
          </a>
        ) : null}

        {!isArrive && eligibleLoungeNames.length > 0 ? (
          <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Lounges you may use</p>
            <ul className="mt-2 space-y-1">
              {eligibleLoungeNames.map((name) => (
                <li key={name} className="text-sm text-sky-50">
                  🛋 {name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-sky-100/70">Ask staff for the nearest entrance — indoor map routing is next.</p>
          </section>
        ) : null}

        {familyPins.length > 0 ? (
          <section
            data-testid="airport-family-chip-strip"
            className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">Family at {code}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {familyPins.map((pin) => (
                <button
                  key={pin.memberId}
                  type="button"
                  data-testid={`airport-family-chip-${pin.memberId}`}
                  onClick={() => onFamilyPinTap?.(pin.memberId)}
                  className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm font-semibold text-white active:opacity-90"
                  style={{ opacity: pin.stale ? 0.65 : 1 }}
                >
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ background: pin.stale ? "#64748b" : pin.color }}
                  />
                  {pin.name}
                  {pin.proximityStatus === "in-terminal" ? " · in terminal" : " · at airport"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-emerald-100/75">GPS only here — tap a name to open the family map.</p>
          </section>
        ) : null}

        {nav?.generalNotes ? (
          <section className="rounded-2xl bg-white/5 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Airport tip</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">{nav.generalNotes}</p>
          </section>
        ) : null}

        {onSwitchToFamilyView ? (
          <button
            type="button"
            data-testid="airport-fallback-family-cta"
            onClick={onSwitchToFamilyView}
            className="w-full rounded-2xl bg-[#f4c95d] px-4 py-3.5 text-sm font-bold text-[#0b1f3a] shadow-lg active:opacity-90"
          >
            👪 Find family on the map
          </button>
        ) : null}

        <p className="text-center text-[10px] leading-relaxed text-slate-500">
          {isArrive
            ? `Arrival coach for ${code} — not a Kepi indoor walk line. Follow signs and the official map.`
            : strongOfficial
              ? `Kepi keeps the trip context; ${officialWayfinding?.provider} provides the verified live airport map.`
              : `Kepi GPS geofencing is active. No verified indoor step-by-step map is registered for ${code} — follow airport signs and staff.`}
        </p>
      </div>
    </div>
  );
}
