"use client";

import type { BookSubTab } from "@/lib/travelAssistant/consumerTabs";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";
import type { FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import type { HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { ItinerarySelfCheckResult } from "@/lib/travelAssistant/itinerarySelfCheck";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

interface BookReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode?: string;
  notes?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightStatus?: string;
  flightSeatNumber?: string;
  roomType?: string;
  checkOutDate?: string;
  plannedOnly?: boolean;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
}

interface LiveStatusResult {
  flightStatus: string;
  delayMinutes: number | null;
  departureGate: string;
  departureTerminal: string;
  arrivalGate: string;
  arrivalTerminal: string;
  onTime: boolean | null;
  checkedAt: string;
  busy: boolean;
  error: string | null;
}

interface BookTabViewProps {
  bookSubTab: BookSubTab;
  onBookSubTabChange: (subTab: BookSubTab) => void;
  reservations: BookReservation[];
  mapReservations: BookReservation[];
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  itinerarySelfCheck?: ItinerarySelfCheckResult;
  transportConflictIds?: Set<string>;
  tripName?: string | null;
  tripId?: string | null;
  flightSearchDefaults?: FlightSearchDefaults;
  pendingForwardReview?: { id: string; reason: string; subject?: string } | null;
  onOpenForwardReview?: (reviewId: string) => void;
  onImportConfirmation?: (file: File) => void;
  importConfirmationBusy?: boolean;
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAddFlight: () => void;
  onAddHotel: () => void;
  usuallySkipsConnections?: boolean;
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  hotelSearchDefaults?: HotelSearchDefaults;
  onLaunchHotelSearch?: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
  onSearchHotels?: () => void;
  onSearchSegment?: (segment: TripStaySegment) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (
    segment: TripStaySegment,
    intent: "needs_hotel" | "skip",
  ) => void | Promise<void>;
  travelFitReservations?: BookReservation[];
}

export function BookTabView({
  bookSubTab,
  onBookSubTabChange,
  reservations,
  mapReservations,
  transportReservations,
  plannedFlightLegs,
  itinerarySelfCheck,
  transportConflictIds,
  tripName,
  tripId,
  flightSearchDefaults,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy,
  liveStatus,
  locationStatus,
  nearestAirport,
  onReservationTap,
  onCheckStatus,
  onDelete,
  onAddFlight,
  onAddHotel,
  usuallySkipsConnections,
  staySegments,
  plannedStayCities,
  onPickPlannedCity,
  hotelSearchDefaults,
  onLaunchHotelSearch,
  onSearchHotels,
  onSearchSegment,
  onAddCityStay,
  onSetStayIntent,
  travelFitReservations,
}: BookTabViewProps) {
  return (
    <section className="space-y-3">
      <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => onBookSubTabChange("flights")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            bookSubTab === "flights"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Flights
        </button>
        <button
          type="button"
          onClick={() => onBookSubTabChange("hotels")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            bookSubTab === "hotels"
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          Hotels
        </button>
      </div>

      {bookSubTab === "flights" ? (
        <FlightsTab
          reservations={reservations.filter((reservation) => reservation.type === "flight")}
          transportReservations={transportReservations}
          plannedFlightLegs={plannedFlightLegs}
          itinerarySelfCheck={itinerarySelfCheck}
          transportConflictIds={transportConflictIds}
          tripName={tripName}
          flightSearchDefaults={flightSearchDefaults}
          pendingForwardReview={pendingForwardReview}
          onOpenForwardReview={onOpenForwardReview}
          onImportConfirmation={onImportConfirmation}
          importConfirmationBusy={importConfirmationBusy}
          liveStatus={liveStatus}
          locationStatus={locationStatus}
          nearestAirport={nearestAirport}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddFlight}
        />
      ) : (
        <HotelsTab
          reservations={reservations.filter((reservation) => reservation.type === "hotel")}
          mapReservations={mapReservations.filter((reservation) => reservation.type === "hotel")}
          tripName={tripName}
          tripId={tripId}
          usuallySkipsConnections={usuallySkipsConnections}
          staySegments={staySegments}
          plannedStayCities={plannedStayCities}
          onPickPlannedCity={onPickPlannedCity}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddHotel}
          hotelSearchDefaults={hotelSearchDefaults}
          onLaunchHotelSearch={onLaunchHotelSearch}
          onSearchHotels={onSearchHotels}
          onSearchSegment={onSearchSegment}
          onAddCityStay={onAddCityStay}
          onSetStayIntent={onSetStayIntent}
          travelFitReservations={travelFitReservations}
        />
      )}
    </section>
  );
}
