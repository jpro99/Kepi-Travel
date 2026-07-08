"use client";

import { InterCityTransportPrompts } from "@/components/travelAssistant/InterCityTransportPrompts";
import { GroundConnectorPrompts } from "@/components/travelAssistant/GroundConnectorPrompts";
import {
  buildFlightSearchPlan,
  type FlightSearchPlan,
  type PlannedFlightLeg,
} from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import {
  groundConnectorToInterCityGap,
  type GroundConnectorGap,
} from "@/lib/travelAssistant/groundConnectorGaps";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";

interface TripHomeTransportSectionProps {
  reservations: Array<{
    id: string;
    type: string;
    localTime: string;
    flightDate?: string;
    flightArrivalAirport?: string;
    flightDepartureAirport?: string;
    location?: string;
    checkOutDate?: string;
    title?: string;
    confirmationCode?: string | null;
  }>;
  tripStart?: string | null;
  tripEnd?: string | null;
  plannedFlightLegs: PlannedFlightLeg[];
  onSearchFlights: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onQuickGroundTransport: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
}

export function TripHomeTransportSection({
  reservations,
  tripStart,
  tripEnd,
  plannedFlightLegs,
  onSearchFlights,
  onQuickGroundTransport,
}: TripHomeTransportSectionProps) {
  const handleConnectorGround = (gap: GroundConnectorGap, mode: QuickGroundMode): void => {
    onQuickGroundTransport(groundConnectorToInterCityGap(gap), mode);
  };

  return (
    <div className="space-y-4">
      <GroundConnectorPrompts
        reservations={reservations}
        tripStart={tripStart}
        tripEnd={tripEnd}
        onQuickGroundTransport={handleConnectorGround}
      />
      <InterCityTransportPrompts
        legs={plannedFlightLegs}
        onSearchFlights={onSearchFlights}
        onQuickGroundTransport={onQuickGroundTransport}
      />
    </div>
  );
}

export { buildFlightSearchPlan };
