"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { CheckInHandoffCard } from "@/components/travelAssistant/CheckInHandoffCard";
import { NextUpCard } from "@/components/travelAssistant/NextUpCard";
import {
  buildCheckInHandoffContent,
} from "@/lib/travelAssistant/checkInHandoff";
import { resolveBoardingPassUrl, type ReservationSourceLink } from "@/lib/travelAssistant/reservationLinks";
import { selectNextRemainingFlight, flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";
import { resolveAirborneHeroCopy } from "@/lib/travelAssistant/airborneLiveClaim";
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
  sourceLinks?: ReservationSourceLink[];
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
    checkedAt?: string;
    busy?: boolean;
    error?: string | null;
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
  const t = useTranslations("HomeAssist");
  const checkInHandoff = useMemo(() => {
    const nextFlight = selectNextRemainingFlight(reservations);
    if (!nextFlight) return null;
    const departureUtcMs = flightDepartureUtcMs(nextFlight);
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
        (() => {
          const airborneCopy = resolveAirborneHeroCopy(
            journeyPhase,
            liveStatus?.[journeyPhase.onFlight.id],
          );
          return (
            <div className="rounded-3xl overflow-hidden bg-[var(--bg-card)] p-5 shadow-lg ring-1 ring-[var(--border-default)]">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">{t("inFlight")}</p>
              <p className="mt-2 text-2xl font-black text-[var(--text-primary)] leading-tight">
                {airborneCopy.title}
              </p>
              {airborneCopy.detail ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">{airborneCopy.detail}</p>
              ) : null}
            </div>
          );
        })()
      ) : journeyPhase.kind === "just-landed" ? (
        <div className="rounded-3xl overflow-hidden bg-[var(--bg-card)] p-5 shadow-lg ring-1 ring-[var(--border-default)]">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t("landedLabel")}</p>
          <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{t("landedTitle")}</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {journeyPhase.landedMinutesAgo < 2
              ? t("justNow")
              : t("minutesAgo", { count: journeyPhase.landedMinutesAgo })}
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
              {locationStatus === "in-terminal" ? t("inTerminal") : t("atAirport")}
            </p>
            <p className="mt-0.5 text-sm text-sky-900/80 dark:text-sky-100/80">{t("airportSubtitle")}</p>
          </div>
          <span className="shrink-0 text-sm font-bold text-[#007AFF] dark:text-[#0A84FF]">{t("go")}</span>
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
