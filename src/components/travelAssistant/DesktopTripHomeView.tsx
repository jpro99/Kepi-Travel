"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import type { GlobeArc } from "@/components/travelAssistant/mobile/TripGlobe";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { DestinationHeroPhoto, resolveHeroCity } from "@/components/travelAssistant/tripHeroVisuals";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
import { collectRouteMapPoints } from "@/lib/travelAssistant/tripRouteMapGeo";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

const TripGlobe = dynamic(
  () => import("@/components/travelAssistant/mobile/TripGlobe").then((m) => m.TripGlobe),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#061428]" /> },
);

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
  locationStatus,
  nearestAirport,
  missingPriceCount = 0,
  onReviewPricing,
  onGapActionTap,
  onReservationTap,
  onOpenBook,
  onOpenPlan,
  onOpenMap,
  liveStatus,
}: DesktopTripHomeViewProps) {
  const transportReservations = reservations.filter((reservation) =>
    ["flight", "train", "ride"].includes(reservation.type),
  );
  const flightCount = reservations.filter((reservation) => reservation.type === "flight").length;
  const hotelCount = reservations.filter((reservation) => reservation.type === "hotel").length;
  const countdown = daysUntilTrip(startDate);
  const dateRange = formatDateRange(startDate, endDate);
  const heroCity = resolveHeroCity(destination, reservations);

  const { arcs, points, hasRoute } = useMemo(() => {
    const route = buildTripTransportRoute(transportReservations);
    const mapPoints = collectRouteMapPoints(route.segments);
    const globeArcs: GlobeArc[] = route.segments
      .filter((segment) => segment.lat != null && segment.lon != null && segment.toLat != null && segment.toLon != null)
      .map((segment) => ({
        id: segment.id,
        fromLat: segment.lat!,
        fromLon: segment.lon!,
        toLat: segment.toLat!,
        toLon: segment.toLon!,
        color: segment.status === "conflict" ? "#ef4444" : segment.booked ? "#007AFF" : "#64748b",
      }));
    return {
      arcs: globeArcs,
      points: mapPoints,
      hasRoute: globeArcs.length > 0,
    };
  }, [transportReservations]);

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
      <button
        type="button"
        onClick={onOpenMap}
        className="group relative block w-full overflow-hidden rounded-2xl bg-[#020818] text-left shadow-xl ring-1 ring-slate-800/80 transition hover:ring-sky-500/40"
        aria-label="Open full trip map"
      >
        <div className="grid min-h-[280px] lg:min-h-[320px] lg:grid-cols-2">
          <div className="relative min-h-[200px] lg:min-h-full">
            <DestinationHeroPhoto city={heroCity} />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-900/30" />
            <div className="relative flex h-full flex-col justify-end p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Home</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white lg:text-4xl">{tripName}</h1>
              <p className="mt-2 text-sm leading-relaxed text-sky-100/85">{subtitleParts.join(" · ")}</p>
            </div>
          </div>

          <div className="relative min-h-[220px] border-t border-white/10 lg:min-h-full lg:border-l lg:border-t-0">
            {hasRoute ? (
              <TripGlobe arcs={arcs} points={points} className="h-full min-h-[220px] lg:min-h-[320px]" />
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center bg-[#061428] px-6 text-center lg:min-h-[320px]">
                <p className="text-sm text-sky-200/70">Add flights to see your route on the globe</p>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#020818] via-[#020818]/80 to-transparent px-5 pb-5 pt-12">
              <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300/80">Your route</p>
              <p className="mt-0.5 text-base font-bold text-white group-hover:text-sky-200">
                Open live map & family view →
              </p>
            </div>
          </div>
        </div>
      </button>

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
