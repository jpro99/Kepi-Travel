"use client";

import dynamic from "next/dynamic";
import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { DestinationHeroPhoto, resolveHeroCity } from "@/components/travelAssistant/tripHeroVisuals";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { HotelStayMapReservation } from "@/lib/travelAssistant/tripHotelStayMap";

const TripHomeOverviewMap = dynamic(
  () => import("@/components/travelAssistant/TripHomeOverviewMap").then((m) => m.TripHomeOverviewMap),
  { ssr: false, loading: () => <div className="h-full min-h-[220px] w-full animate-pulse bg-[#dbeafe] lg:min-h-[320px]" /> },
);

interface TripReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightDate?: string;
  checkOutDate?: string;
  roomType?: string;
  hotelSearchCity?: string;
  plannedOnly?: boolean;
}

interface DesktopTripHomeViewProps {
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  journeyPhase: JourneyPhase;
  reservations: TripReservation[];
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  staySegments?: TripStaySegment[];
  locationStatus: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport: string;
  missingPriceCount?: number;
  onReviewPricing?: () => void;
  onGapActionTap?: (tab: string) => void;
  onReservationTap: (id: string) => void;
  onOpenBook: () => void;
  onOpenPlan: () => void;
  onOpenMap: () => void;
  onAddGroundTransport?: () => void;
  onCreateTrip?: () => void;
  liveStatus?: Record<string, {
    flightStatus: string;
    delayMinutes: number | null;
    departureGate: string;
    departureTerminal: string;
    onTime: boolean | null;
  }>;
}

function daysUntilTrip(startDate: string | null | undefined): number | null {
  if (!startDate) return null;
  const start = Date.parse(`${startDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.ceil((start - Date.now()) / 86_400_000));
}

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate || !endDate) return null;
  const fmt = (value: string) =>
    new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

export function DesktopTripHomeView({
  tripName,
  destination,
  startDate,
  endDate,
  journeyPhase,
  reservations,
  transportReservations: transportReservationsProp,
  plannedFlightLegs = [],
  staySegments = [],
  locationStatus,
  nearestAirport,
  missingPriceCount = 0,
  onReviewPricing,
  onGapActionTap,
  onReservationTap,
  onOpenBook,
  onOpenPlan,
  onOpenMap,
  onAddGroundTransport,
  onCreateTrip,
  liveStatus,
}: DesktopTripHomeViewProps) {
  const transportReservations =
    transportReservationsProp ??
    reservations.filter((reservation) => ["flight", "train", "ride"].includes(reservation.type));
  const hotelReservations = reservations.filter((reservation) => reservation.type === "hotel") as HotelStayMapReservation[];
  const flightCount = reservations.filter((reservation) => reservation.type === "flight").length;
  const hotelCount = hotelReservations.length;
  const countdown = daysUntilTrip(startDate);
  const dateRange = formatDateRange(startDate, endDate);
  const heroCity = resolveHeroCity(destination, reservations);

  const subtitleParts = [
    destination ?? heroCity,
    dateRange,
    countdown != null && countdown > 0 ? `${countdown} day${countdown === 1 ? "" : "s"} away` : null,
    flightCount > 0 || hotelCount > 0
      ? `${flightCount} flight${flightCount === 1 ? "" : "s"} · ${hotelCount} hotel${hotelCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-[#020818] shadow-xl ring-1 ring-slate-800/80">
        <div className="grid min-h-[280px] lg:min-h-[360px] lg:grid-cols-2">
          <div className="relative min-h-[200px] lg:min-h-full">
            <DestinationHeroPhoto city={heroCity} />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-900/30" />
            <div className="relative flex h-full flex-col justify-end p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Home</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-white lg:text-4xl">{tripName}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-sky-100/85">{subtitleParts.join(" · ")}</p>
                </div>
                {onCreateTrip ? (
                  <button
                    type="button"
                    onClick={onCreateTrip}
                    className="shrink-0 rounded-full border border-sky-300/40 bg-sky-400/15 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-400/25"
                  >
                    + New trip
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative min-h-[240px] border-t border-white/10 lg:min-h-full lg:border-l lg:border-t-0">
            <TripHomeOverviewMap
              transportReservations={transportReservations}
              hotelReservations={hotelReservations}
              plannedFlightLegs={plannedFlightLegs}
              staySegments={staySegments}
              onReservationTap={onReservationTap}
              className="h-full min-h-[240px] lg:min-h-[360px]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#020818]/90 via-[#020818]/40 to-transparent px-5 pb-4 pt-10">
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300/80">Your trip map</p>
              <p className="mt-0.5 text-sm text-sky-100/90">
                Pinch or scroll to zoom · tap a flight line or hotel pin
              </p>
              <button
                type="button"
                onClick={onOpenMap}
                className="pointer-events-auto mt-2 text-sm font-semibold text-sky-300 underline hover:text-sky-200"
              >
                Open live family map →
              </button>
            </div>
          </div>
        </div>
      </div>

      <MobileAssistView
        journeyPhase={journeyPhase}
        reservations={reservations.map((reservation) => ({
          ...reservation,
          location: reservation.location ?? "",
          confirmationCode: reservation.confirmationCode ?? "",
        }))}
        tripName={tripName}
        locationStatus={locationStatus}
        nearestAirport={nearestAirport}
        onReservationTap={onReservationTap}
        liveStatus={liveStatus}
      />

      <TripHealthStrip
        reservations={reservations.map((reservation) => ({
          ...reservation,
          provider: reservation.provider,
          location: reservation.location ?? "",
        }))}
        missingPriceCount={missingPriceCount}
        onGapActionTap={onGapActionTap}
        onReviewPricing={onReviewPricing}
      />

      {onAddGroundTransport ? (
        <button
          type="button"
          onClick={onAddGroundTransport}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full border border-dashed border-slate-300 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-sky-200 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
        >
          <span aria-hidden>🚕</span>
          Add airport, hotel, or venue transfer
        </button>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onOpenBook}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Book</p>
          <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">
            {flightCount} flight{flightCount === 1 ? "" : "s"} · {hotelCount} hotel{hotelCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Search, tickets, and confirmations</p>
        </button>
        <button
          type="button"
          onClick={onOpenPlan}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Plan</p>
          <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Day-by-day</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Timeline, calendar, and notes</p>
        </button>
        <button
          type="button"
          onClick={onOpenMap}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Map</p>
          <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Live view</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Family map and airport mode</p>
        </button>
      </div>
    </section>
  );
}
