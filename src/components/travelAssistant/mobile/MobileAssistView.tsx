"use client";

import { useMemo } from "react";
import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { CheckInHandoffCard } from "@/components/travelAssistant/CheckInHandoffCard";
import { NextUpCard } from "@/components/travelAssistant/NextUpCard";
import {
  buildCheckInHandoffContent,
  parseDepartureUtcMs,
} from "@/lib/travelAssistant/checkInHandoff";
import { resolveBoardingPassUrl } from "@/lib/travelAssistant/reservationLinks";
import { canonicalFlightDepartureLocalTime } from "@/lib/travelAssistant/tripWindow";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

interface Reservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  boardingPassUrl?: string;
  sourceLinks?: Array<{ label: string; url: string; kind: string }>;
  originalEmailText?: string;
}

interface MobileAssistViewProps {
  journeyPhase: JourneyPhase;
  reservations: Reservation[];
  tripName: string;
  locationStatus: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport: string;
  onReservationTap: (id: string) => void;
  liveStatus?: Record<string, {
    flightStatus: string;
    delayMinutes: number | null;
    departureGate: string;
    departureTerminal: string;
    onTime: boolean | null;
  }>;
}

export function MobileAssistView({
  journeyPhase,
  reservations,
  tripName,
  locationStatus,
  nearestAirport,
  onReservationTap,
  liveStatus,
}: MobileAssistViewProps) {
  const checkInHandoff = useMemo(() => {
    const nextFlight = [...reservations]
      .filter((reservation) => reservation.type === "flight")
      .sort((left, right) => {
        const leftMs = parseDepartureUtcMs(
          canonicalFlightDepartureLocalTime(left),
          left.timezone,
        ) ?? Number.POSITIVE_INFINITY;
        const rightMs = parseDepartureUtcMs(
          canonicalFlightDepartureLocalTime(right),
          right.timezone,
        ) ?? Number.POSITIVE_INFINITY;
        return leftMs - rightMs;
      })[0];
    if (!nextFlight) return null;
    const departureUtcMs = parseDepartureUtcMs(
      canonicalFlightDepartureLocalTime(nextFlight),
      nextFlight.timezone,
    );
    return buildCheckInHandoffContent({
      id: nextFlight.id,
      flightNumber: nextFlight.flightNumber,
      flightAirline: nextFlight.flightAirline,
      provider: nextFlight.provider,
      confirmationCode: nextFlight.confirmationCode,
      flightDepartureAirport: nextFlight.flightDepartureAirport,
      departureUtcMs,
      boardingPassUrl: resolveBoardingPassUrl({
        boardingPassUrl: nextFlight.boardingPassUrl,
        sourceLinks: nextFlight.sourceLinks,
        originalEmailText: nextFlight.originalEmailText,
      }),
    });
  }, [reservations]);

  return (
    <section className="space-y-4">
      {journeyPhase.kind === "airborne" ? (
        <div className="rounded-3xl overflow-hidden bg-[var(--bg-card)] p-5 shadow-lg ring-1 ring-[var(--border-default)]">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">In flight</p>
          <p className="mt-2 text-2xl font-black text-[var(--text-primary)] leading-tight">
            {(journeyPhase.onFlight as Reservation & { flightDepartureAirport?: string }).flightDepartureAirport ?? ""} →{" "}
            {journeyPhase.landingAt}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Landing in {journeyPhase.landingIn}
          </p>
        </div>
      ) : journeyPhase.kind === "just-landed" ? (
        <div className="rounded-3xl overflow-hidden bg-[var(--bg-card)] p-5 shadow-lg ring-1 ring-[var(--border-default)]">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Welcome</p>
          <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">You&apos;ve landed</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {journeyPhase.landedMinutesAgo < 2 ? "Just now" : `${journeyPhase.landedMinutesAgo} min ago`}
          </p>
        </div>
      ) : null}

      {(locationStatus === "at-airport" || locationStatus === "in-terminal") &&
      journeyPhase.kind !== "post-trip" &&
      journeyPhase.kind !== "no-trip" &&
      journeyPhase.kind !== "airborne" ? (
        <LiveMapLink
          className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-4 shadow-sm dark:border-sky-500/40 dark:from-sky-950/60 dark:to-blue-950/40"
        >
          <div className="min-w-0">
            <p className="text-base font-bold text-sky-950 dark:text-sky-100">
              {locationStatus === "in-terminal" ? "Inside the terminal" : "You're at the airport"}
            </p>
            <p className="mt-0.5 text-sm text-sky-900/80 dark:text-sky-100/80">
              Open gate routing and terminal map
            </p>
          </div>
          <span className="shrink-0 text-sm font-bold text-[#007AFF] dark:text-[#0A84FF]">Go →</span>
        </LiveMapLink>
      ) : null}

      {checkInHandoff ? <CheckInHandoffCard content={checkInHandoff} /> : null}

      <NextUpCard
          reservations={reservations}
          tripName={tripName}
          onReservationTap={onReservationTap}
          locationStatus={locationStatus}
          nearestAirport={nearestAirport}
          liveStatus={liveStatus}
        />
    </section>
  );
}
