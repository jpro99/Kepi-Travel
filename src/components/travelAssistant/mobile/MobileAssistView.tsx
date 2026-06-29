"use client";

import Link from "next/link";
import { NextUpCard } from "@/components/travelAssistant/NextUpCard";
import { OnTrackButton } from "@/components/travelAssistant/OnTrackButton";
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
}

interface MobileAssistViewProps {
  journeyPhase: JourneyPhase;
  reservations: Reservation[];
  tripName: string;
  locationStatus: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport: string;
  onReservationTap: (id: string) => void;
}

export function MobileAssistView({
  journeyPhase,
  reservations,
  tripName,
  locationStatus,
  nearestAirport,
  onReservationTap,
}: MobileAssistViewProps) {
  return (
    <section className="space-y-4">
      {journeyPhase.kind === "airborne" ? (
        <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-5 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-300/70">In flight</p>
          <p className="mt-2 text-2xl font-black text-white leading-tight">
            {(journeyPhase.onFlight as Reservation & { flightDepartureAirport?: string }).flightDepartureAirport ?? ""} →{" "}
            {journeyPhase.landingAt}
          </p>
          <p className="mt-2 text-sm text-sky-200/70">
            Landing in {journeyPhase.landingIn}
          </p>
        </div>
      ) : journeyPhase.kind === "just-landed" ? (
        <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 p-5 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/70">Welcome</p>
          <p className="mt-2 text-2xl font-black text-white">You&apos;ve landed</p>
          <p className="mt-2 text-sm text-emerald-200/70">
            {journeyPhase.landedMinutesAgo < 2 ? "Just now" : `${journeyPhase.landedMinutesAgo} min ago`}
          </p>
        </div>
      ) : null}

      {(locationStatus === "at-airport" || locationStatus === "in-terminal") &&
      journeyPhase.kind !== "post-trip" &&
      journeyPhase.kind !== "no-trip" &&
      journeyPhase.kind !== "airborne" ? (
        <Link
          href="/travel-assistant/live-map?view=airport"
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
        </Link>
      ) : null}

      <div className="rounded-3xl bg-white p-1 shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08]">
        <NextUpCard
          reservations={reservations}
          tripName={tripName}
          onReservationTap={onReservationTap}
          locationStatus={locationStatus}
          nearestAirport={nearestAirport}
        />
      </div>

      <OnTrackButton
        reservations={reservations}
        tripName={tripName}
        locationStatus={locationStatus}
        nearestAirport={nearestAirport}
      />
    </section>
  );
}
