"use client";

import type { BookSubTab } from "@/lib/travelAssistant/consumerTabs";
import { bookSubTabButtonClass, BOOK_SUBTAB_TOGGLE_CLASS } from "@/components/travelAssistant/bookTabStyles";
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
  flightCount?: number;
  hotelCount?: number;
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
  flightCount = 0,
  hotelCount = 0,
}: BookTabViewProps) {
  return (
    <section className="space-y-3">
      <header className="rounded-2xl bg-[#0F1923] px-5 py-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Book</p>
        <h1 className="mt-1 text-xl font-bold text-white">{tripName ?? "Your trip"}</h1>
        <p className="mt-1 text-sm text-slate-300">
          {flightCount} flight{flightCount === 1 ? "" : "s"} · {hotelCount} hotel{hotelCount === 1 ? "" : "s"}
        </p>
      </header>

      <div className={BOOK_SUBTAB_TOGGLE_CLASS}>
        <button
          type="button"
          onClick={() => onBookSubTabChange("flights")}
          className={bookSubTabButtonClass(bookSubTab === "flights")}
        >
          Flights
        </button>
        <button
          type="button"
          onClick={() => onBookSubTabChange("hotels")}
          className={bookSubTabButtonClass(bookSubTab === "hotels")}
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
