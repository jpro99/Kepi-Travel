"use client";

import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { TripTransportRouteMap } from "@/components/travelAssistant/TripTransportRouteMap";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

interface TripReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
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
}

interface DesktopTripHomeViewProps {
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  journeyPhase: JourneyPhase;
  reservations: TripReservation[];
  locationStatus: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport: string;
  missingPriceCount?: number;
  onReviewPricing?: () => void;
  onGapActionTap?: (tab: string) => void;
  onReservationTap: (id: string) => void;
  onOpenBook: () => void;
  onOpenPlan: () => void;
  onOpenMap: () => void;
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
  locationStatus,
  nearestAirport,
  missingPriceCount = 0,
  onReviewPricing,
  onGapActionTap,
  onReservationTap,
  onOpenBook,
  onOpenPlan,
  onOpenMap,
}: DesktopTripHomeViewProps) {
  const transportReservations = reservations.filter((reservation) =>
    ["flight", "train", "ride"].includes(reservation.type),
  );
  const flightCount = reservations.filter((reservation) => reservation.type === "flight").length;
  const hotelCount = reservations.filter((reservation) => reservation.type === "hotel").length;
  const countdown = daysUntilTrip(startDate);
  const dateRange = formatDateRange(startDate, endDate);

  return (
    <section className="space-y-5">
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 px-6 py-5 text-white shadow-lg">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">Home</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">{tripName}</h1>
        <p className="mt-2 text-sm text-sky-100/80">
          {destination ? `${destination}` : "Your trip"}
          {dateRange ? ` · ${dateRange}` : ""}
          {countdown != null && countdown > 0 ? ` · ${countdown} day${countdown === 1 ? "" : "s"} away` : ""}
          {flightCount > 0 || hotelCount > 0
            ? ` · ${flightCount} flight${flightCount === 1 ? "" : "s"} · ${hotelCount} hotel${hotelCount === 1 ? "" : "s"}`
            : ""}
        </p>
      </header>

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

      {transportReservations.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Your route</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Follow the trip flow — tap a leg for details</p>
          </div>
          <TripTransportRouteMap
            reservations={transportReservations}
            sectionId="desktop-home-route-map"
            onSegmentTap={onReservationTap}
          />
        </div>
      ) : null}

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
      />

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
