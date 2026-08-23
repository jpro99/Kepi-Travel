"use client";

import dynamic from "next/dynamic";
import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { buildLiveAirportMapUrl } from "@/lib/travelAssistant/liveMapSession";
import {
  findPlannableAirportIata,
  mapTabLeadMode,
  showFamilyLocationAsPrimaryCta,
  showMapTabAirportCta,
} from "@/lib/travelAssistant/mapTabLead";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { HotelStayMapReservation } from "@/lib/travelAssistant/tripHotelStayMap";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

const TripHomeOverviewMap = dynamic(
  () => import("@/components/travelAssistant/TripHomeOverviewMap").then((m) => m.TripHomeOverviewMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#dbeafe]" /> },
);

interface MapTabViewProps {
  tripId?: string | null;
  transportReservations: TransportRouteReservation[];
  hotelReservations: HotelStayMapReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  staySegments?: TripStaySegment[];
  onReservationTap?: (reservationId: string) => void;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  preferUserLocation?: boolean;
  mapClassName?: string;
}

export function MapTabView({
  tripId = null,
  transportReservations,
  hotelReservations,
  plannedFlightLegs = [],
  staySegments = [],
  onReservationTap,
  locationStatus = "unknown",
  preferUserLocation = false,
  mapClassName = "h-full min-h-[min(52dvh,28rem)]",
}: MapTabViewProps) {
  const upcomingFlightCount = transportReservations.filter((r) => r.type === "flight").length;
  const lead = mapTabLeadMode({
    stayCount: hotelReservations.length,
    upcomingFlightCount,
  });
  const atAirport = locationStatus === "at-airport" || locationStatus === "in-terminal";
  const plannableAirport = findPlannableAirportIata(transportReservations);
  const showAirport = showMapTabAirportCta({ atAirport, plannableAirport });
  const familyPrimary = showFamilyLocationAsPrimaryCta();

  return (
    <div className="space-y-3">
      <header className="px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">Trip map</p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-[#1D1D1F]">
          {lead === "trip" ? "Where you’re going" : "Your map"}
        </h2>
      </header>
      <div className="relative min-h-[min(52dvh,28rem)] overflow-hidden rounded-[var(--radius-card)] bg-[#dbeafe] ring-1 ring-[var(--border-default)]">
        <TripHomeOverviewMap
          transportReservations={transportReservations}
          hotelReservations={hotelReservations}
          plannedFlightLegs={plannedFlightLegs}
          staySegments={staySegments}
          onReservationTap={onReservationTap}
          preferUserLocation={preferUserLocation}
          className={mapClassName}
        />
        {showAirport ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 pt-16">
            <LiveMapLink
              href={buildLiveAirportMapUrl({
                tripId,
                iata: plannableAirport,
              })}
              className="pointer-events-auto min-h-[48px] rounded-full bg-[#007AFF] px-5 py-3 text-[17px] font-bold text-white shadow-lg"
            >
              {atAirport ? "Airport mode" : `Plan ${plannableAirport} airport`}
            </LiveMapLink>
          </div>
        ) : null}
      </div>
      {!familyPrimary ? (
        <LiveMapLink className="flex min-h-[48px] items-center justify-center text-[17px] font-semibold text-[#007AFF]">
          Share location with family
        </LiveMapLink>
      ) : null}
    </div>
  );
}
