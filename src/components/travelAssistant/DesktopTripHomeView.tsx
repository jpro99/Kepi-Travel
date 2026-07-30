"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { MissionControlView } from "@/components/travelAssistant/MissionControlView";
import type { TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { resolveNextCheckInHandoff } from "@/lib/travelAssistant/checkInHandoff";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { HotelStayMapReservation } from "@/lib/travelAssistant/tripHotelStayMap";
import { TripHomeTransportSection } from "@/components/travelAssistant/TripHomeTransportSection";
import { isTravelDayTakeover } from "@/lib/travelAssistant/homeDayTruth";
import { buildMissionControlSnapshot } from "@/lib/travelAssistant/tripPhase";

const TripHomeOverviewMap = dynamic(
  () => import("@/components/travelAssistant/TripHomeOverviewMap").then((m) => m.TripHomeOverviewMap),
  { ssr: false, loading: () => <div className="h-[200px] w-full animate-pulse rounded-2xl bg-[#F5F5F7]" /> },
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
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  onReviewPricing?: () => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onSkipPreDepartureNight?: (flightDay: string) => void;
  onReservationTap: (id: string) => void;
  onOpenBook: () => void;
  onOpenPlan: () => void;
  onOpenMap: () => void;
  onOpenAirportMode: () => void;
  onAddGroundTransport?: () => void;
  onStartNewTrip?: () => void;
  showFreePlanNudge?: boolean;
  onSeeProPlans?: () => void;
  onSearchFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onQuickGroundTransport?: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
  liveStatus?: Record<
    string,
    {
      flightStatus: string;
      delayMinutes: number | null;
      departureGate: string;
      departureTerminal: string;
      onTime: boolean | null;
    }
  >;
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
  onGapActionTap,
  onReservationTap,
  onOpenBook,
  onOpenPlan,
  onOpenMap,
  onOpenAirportMode,
  onAddGroundTransport,
  onStartNewTrip,
  showFreePlanNudge = false,
  onSeeProPlans,
  onSearchFlights,
  onQuickGroundTransport,
  liveStatus,
  stayDecisions,
  missingPriceCount = 0,
}: DesktopTripHomeViewProps) {
  const transportReservations =
    transportReservationsProp ??
    reservations.filter((reservation) => ["flight", "train", "ride"].includes(reservation.type));
  const hotelReservations = reservations.filter(
    (reservation) => reservation.type === "hotel",
  ) as HotelStayMapReservation[];
  const hasTrip = journeyPhase.kind !== "no-trip" && journeyPhase.kind !== "post-trip";
  const atAirport = locationStatus === "at-airport" || locationStatus === "in-terminal";
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
        hasActiveTrip: hasTrip,
      }),
    [tripName, destination, startDate, endDate, reservations, stayDecisions, liveStatus, hasTrip],
  );
  const travelTakeover = isTravelDayTakeover(journeyPhase, snap.openAirportMode || atAirport);

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-1">
      <MissionControlView
        tripName={tripName}
        destination={destination}
        startDate={startDate}
        endDate={endDate}
        reservations={reservations}
        stayDecisions={stayDecisions}
        liveStatus={liveStatus}
        hasActiveTrip={hasTrip}
        journeyPhase={journeyPhase}
        locationStatus={locationStatus}
        checkInHandoff={resolveNextCheckInHandoff(reservations)}
        onOpenBook={onOpenBook}
        onOpenPlan={onOpenPlan}
        onOpenAirportMode={onOpenAirportMode}
        onStartNewTrip={onStartNewTrip}
        showFreePlanNudge={showFreePlanNudge}
        onSeeProPlans={onSeeProPlans}
        missingPriceCount={missingPriceCount}
        onReservationTap={onReservationTap}
        onGapActionTap={onGapActionTap}
        onSeeAllAttention={onOpenPlan}
      />

      {/* I36: on travel day, Home is the takeover screen only — no map/transport chrome. */}
      {hasTrip && !travelTakeover ? (
        <div className="overflow-hidden rounded-2xl bg-[#F5F5F7]">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] font-semibold text-[#6E6E73]">Trip map</p>
            <button
              type="button"
              onClick={onOpenMap}
              className="min-h-[44px] text-[14px] font-semibold text-[#007AFF]"
            >
              Open Live Map
            </button>
          </div>
          <TripHomeOverviewMap
            transportReservations={transportReservations}
            hotelReservations={hotelReservations}
            plannedFlightLegs={plannedFlightLegs}
            staySegments={staySegments}
            onReservationTap={onReservationTap}
            className="h-[200px] w-full"
          />
        </div>
      ) : null}

      {hasTrip && !travelTakeover && onSearchFlights && onQuickGroundTransport ? (
        <TripHomeTransportSection
          reservations={reservations}
          tripStart={startDate}
          tripEnd={endDate}
          plannedFlightLegs={plannedFlightLegs}
          onSearchFlights={onSearchFlights}
          onQuickGroundTransport={onQuickGroundTransport}
        />
      ) : null}

      {hasTrip && !travelTakeover && onAddGroundTransport ? (
        <button
          type="button"
          onClick={onAddGroundTransport}
          className="flex w-full min-h-[48px] items-center justify-center rounded-2xl border border-dashed border-[#D2D2D7] bg-white px-4 text-[15px] font-medium text-[#6E6E73]"
        >
          Add ground transfer
        </button>
      ) : null}
    </section>
  );
}
