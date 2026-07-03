"use client";

import { useState } from "react";
import { BookTravelFitStrip } from "@/components/travelAssistant/BookTravelFitStrip";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";
import { ExcursionsTab } from "@/components/travelAssistant/ExcursionsTab";
import type { FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import type { HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { ExcursionSearchDefaults } from "@/components/travelAssistant/ExcursionSearchLauncher";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

type MobileTripsSegment = "flights" | "hotels" | "excursions";

interface TripSummary {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

interface Reservation {
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
  checkOutDate?: string;
  roomType?: string;
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

interface MobileTripsViewProps {
  hasActiveTrip: boolean;
  trip: TripSummary | null;
  reservations: Reservation[];
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
  onCreateTrip: () => void;
  onAddBooking: () => void;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  hotelNotebookNote?: string;
  onHotelNotebookChange?: (value: string) => void;
  /** Trip tab uses Map for routes — skip duplicate route map here */
  hideRouteMap?: boolean;
  /** When set, segment toggle is rendered by the parent (Book tab chrome). */
  segment?: MobileTripsSegment;
  onSegmentChange?: (segment: MobileTripsSegment) => void;
  hideSegmentToggle?: boolean;
  /** Full Book tab wiring — search, planners, loyalty. */
  enableBookSearch?: boolean;
  tripId?: string | null;
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  flightSearchDefaults?: FlightSearchDefaults;
  hotelSearchDefaults?: HotelSearchDefaults;
  excursionSearchDefaults?: ExcursionSearchDefaults;
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  usuallySkipsConnections?: boolean;
  onLaunchHotelSearch?: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
  onSearchHotels?: () => void;
  onSearchSegment?: (segment: TripStaySegment) => void;
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (segment: TripStaySegment, intent: "needs_hotel" | "skip") => void | Promise<void>;
  onExcursionBooked?: () => void;
  readOnly?: boolean;
  pendingForwardReview?: { id: string; reason: string; subject?: string } | null;
  onOpenForwardReview?: (reviewId: string) => void;
  onImportConfirmation?: (file: File) => void;
  importConfirmationBusy?: boolean;
  travelFitReservations?: Reservation[];
}

function TicketCard({
  reservation,
  onTap,
}: {
  reservation: Reservation;
  onTap: (id: string) => void;
}) {
  const typeLabel =
    reservation.type === "train"
      ? "Train"
      : reservation.type === "ride"
        ? "Ride"
        : reservation.type === "dinner"
          ? "Dining"
          : "Ticket";

  return (
    <button
      type="button"
      onClick={() => onTap(reservation.id)}
      className="w-full rounded-2xl bg-[var(--bg-card)] p-4 text-left shadow-sm ring-1 ring-[var(--border-default)] transition active:scale-[0.99]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{typeLabel}</p>
      <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{reservation.title}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{reservation.provider}</p>
      {reservation.confirmationCode ? (
        <p className="mt-2 text-sm font-medium text-[#007AFF]">{reservation.confirmationCode}</p>
      ) : null}
    </button>
  );
}

export function MobileTripsView({
  hasActiveTrip,
  trip,
  reservations,
  liveStatus,
  locationStatus,
  nearestAirport,
  onCreateTrip,
  onAddBooking,
  onReservationTap,
  onCheckStatus,
  onDelete,
  hotelNotebookNote = "",
  onHotelNotebookChange,
  hideRouteMap = false,
  segment: segmentProp,
  onSegmentChange,
  hideSegmentToggle = false,
  enableBookSearch = false,
  tripId,
  transportReservations,
  plannedFlightLegs = [],
  flightSearchDefaults,
  hotelSearchDefaults,
  excursionSearchDefaults,
  staySegments = [],
  plannedStayCities = [],
  usuallySkipsConnections,
  onLaunchHotelSearch,
  onSearchHotels,
  onSearchSegment,
  onPickPlannedCity,
  onAddCityStay,
  onSetStayIntent,
  onExcursionBooked,
  readOnly = false,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy,
  travelFitReservations = [],
}: MobileTripsViewProps) {
  const [internalSegment, setInternalSegment] = useState<MobileTripsSegment>("flights");
  const segment = segmentProp ?? internalSegment;
  const setSegment = onSegmentChange ?? setInternalSegment;

  const flights = reservations.filter((r) => r.type === "flight");
  const hotels = reservations.filter((r) => r.type === "hotel");
  const tickets = reservations.filter(
    (reservation) =>
      reservation.type !== "flight" &&
      reservation.type !== "hotel" &&
      !reservation.notes?.includes("kepi-excursion:"),
  );

  if (!hasActiveTrip) {
    return (
      <section className="space-y-4">
        <div className="rounded-[var(--radius-card)] bg-[var(--bg-card)] p-6 text-center shadow-[var(--shadow-card)]">
          <p className="text-[26px] font-bold text-[var(--text-primary)]">Your trips live here</p>
          <p className="mt-3 text-[19px] leading-snug text-[var(--text-secondary)]">
            Create a trip to see flights, hotels, and tickets in one clean place.
          </p>
          <button
            type="button"
            onClick={onCreateTrip}
            className="mt-6 min-h-[56px] w-full rounded-[var(--radius-button)] bg-[var(--accent)] px-6 text-[19px] font-bold text-white"
          >
            Create your trip
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {!hideSegmentToggle ? (
        <div className="flex gap-2 rounded-2xl bg-[var(--bg-muted)] p-1.5">
          {(["flights", "hotels", "excursions"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSegment(id)}
              className={`min-h-[52px] flex-1 rounded-xl font-bold transition touch-manipulation ${
                segment === id
                  ? "bg-[var(--bg-card)] text-[19px] text-[var(--text-primary)] shadow-sm"
                  : "text-[17px] text-[var(--text-muted)]"
              }`}
            >
              {id === "excursions" ? "Experiences" : id.charAt(0).toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
      ) : null}

      {enableBookSearch && travelFitReservations.length > 0 ? (
        <BookTravelFitStrip
          reservations={travelFitReservations}
          bookSubTab={segment}
        />
      ) : null}

      {segment === "flights" ? (
        <FlightsTab
          reservations={flights}
          transportReservations={transportReservations ?? reservations.filter((r) =>
            ["flight", "train", "ride"].includes(r.type),
          )}
          plannedFlightLegs={plannedFlightLegs}
          tripName={trip?.name ?? null}
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
          onAdd={onAddBooking}
          simplifiedMobile
          enableBookSearch={enableBookSearch}
          hideRouteMap={hideRouteMap}
        />
      ) : segment === "hotels" ? (
        <HotelsTab
          reservations={hotels}
          mapReservations={hotels}
          tripName={trip?.name ?? null}
          tripId={tripId}
          staySegments={staySegments}
          plannedStayCities={plannedStayCities}
          onPickPlannedCity={onPickPlannedCity}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddBooking}
          simplifiedMobile
          enableBookSearch={enableBookSearch}
          hotelSearchDefaults={hotelSearchDefaults}
          onLaunchHotelSearch={onLaunchHotelSearch}
          onSearchHotels={onSearchHotels}
          onSearchSegment={onSearchSegment}
          onAddCityStay={onAddCityStay}
          onSetStayIntent={onSetStayIntent}
          usuallySkipsConnections={usuallySkipsConnections}
          hotelNotebookNote={hotelNotebookNote}
          onHotelNotebookChange={onHotelNotebookChange}
          travelFitReservations={travelFitReservations}
        />
      ) : (
        <ExcursionsTab
          reservations={reservations.filter((reservation) => reservation.notes?.includes("kepi-excursion:"))}
          tripId={tripId}
          tripName={trip?.name ?? null}
          searchDefaults={excursionSearchDefaults}
          onReservationTap={onReservationTap}
          onDelete={onDelete}
          onAddManual={onAddBooking}
          onBooked={onExcursionBooked}
          readOnly={readOnly}
          simplifiedMobile
          enableBookSearch={enableBookSearch}
        />
      )}

      {tickets.length > 0 ? (
        <div className="space-y-3 pt-2">
          <p className="text-[13px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Other bookings</p>
          {tickets.map((reservation) => (
            <TicketCard key={reservation.id} reservation={reservation} onTap={onReservationTap} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
