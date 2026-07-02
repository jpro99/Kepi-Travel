"use client";

import { useState } from "react";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";

type MobileTripsSegment = "flights" | "hotels";

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
}: MobileTripsViewProps) {
  const [internalSegment, setInternalSegment] = useState<MobileTripsSegment>("flights");
  const segment = segmentProp ?? internalSegment;
  const setSegment = onSegmentChange ?? setInternalSegment;

  const flights = reservations.filter((r) => r.type === "flight");
  const hotels = reservations.filter((r) => r.type === "hotel");
  const tickets = reservations.filter((r) => r.type !== "flight" && r.type !== "hotel");

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
          {(["flights", "hotels"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSegment(id)}
              className={`min-h-[52px] flex-1 rounded-xl font-bold capitalize transition touch-manipulation ${
                segment === id
                  ? "bg-[var(--bg-card)] text-[19px] text-[var(--text-primary)] shadow-sm"
                  : "text-[17px] text-[var(--text-muted)]"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}

      {segment === "flights" ? (
        <FlightsTab
          reservations={flights}
          transportReservations={reservations.filter((r) =>
            ["flight", "train", "ride"].includes(r.type),
          )}
          liveStatus={liveStatus}
          locationStatus={locationStatus}
          nearestAirport={nearestAirport}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddBooking}
          simplifiedMobile
          hideRouteMap={hideRouteMap}
        />
      ) : (
        <HotelsTab
          reservations={hotels}
          mapReservations={hotels}
          tripName={trip?.name ?? null}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddBooking}
          simplifiedMobile
          hotelNotebookNote={hotelNotebookNote}
          onHotelNotebookChange={onHotelNotebookChange}
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
