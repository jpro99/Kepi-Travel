"use client";

import { useState } from "react";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";
import { MobileItineraryReader } from "@/components/travelAssistant/mobile/MobileItineraryReader";
import {
  MOBILE_TRIPS_SEGMENTS,
  type MobileTripsSegment,
} from "@/components/travelAssistant/mobile/mobileShellTypes";
import type { StopDateRange } from "@/lib/decision/stopDates";

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
  dayNotes?: Record<string, string>;
  stopRanges?: StopDateRange[];
  onDayNoteChange?: (dateKey: string, value: string) => void;
}

function formatTripDates(start: string, end: string): string {
  const fmt = (value: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
    if (!match) return "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(match[2]) - 1]} ${Number(match[3])}`;
  };
  const startLabel = fmt(start);
  const endLabel = fmt(end);
  if (!startLabel && !endLabel) return "Dates TBD";
  if (startLabel && endLabel && start !== end) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel;
}

const CARD = "rounded-3xl bg-[var(--bg-card)] p-5 shadow-sm ring-1 ring-[var(--border-default)]";

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
  dayNotes = {},
  stopRanges = [],
  onDayNoteChange,
}: MobileTripsViewProps) {
  const [segment, setSegment] = useState<MobileTripsSegment>("flights");
  const [itineraryOpen, setItineraryOpen] = useState(false);

  const flights = reservations.filter((r) => r.type === "flight");
  const hotels = reservations.filter((r) => r.type === "hotel");
  const tickets = reservations.filter((r) => r.type !== "flight" && r.type !== "hotel");

  if (!hasActiveTrip) {
    return (
      <section className="space-y-4">
        <div className={`${CARD} p-6 text-center`}>
          <p className="text-2xl font-black text-[var(--text-primary)]">Your trips live here</p>
          <p className="mt-2 text-base text-[var(--text-muted)]">
            Create a trip to see flights, hotels, and tickets in one clean place.
          </p>
          <button
            type="button"
            onClick={onCreateTrip}
            className="mt-6 min-h-[52px] w-full rounded-2xl bg-[#007AFF] px-6 text-[17px] font-bold text-white shadow-lg shadow-blue-500/25 active:scale-[0.99]"
          >
            Create your trip
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className={CARD}>
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Active trip</p>
        <p className="mt-1 text-[1.75rem] font-black leading-tight text-[var(--text-primary)]">
          {trip?.name ?? "Your trip"}
        </p>
        <p className="mt-1 text-[17px] text-[var(--text-muted)]">
          {trip?.destination || "Destination TBD"}
          {trip?.startDate || trip?.endDate
            ? ` · ${formatTripDates(trip?.startDate ?? "", trip?.endDate ?? "")}`
            : ""}
        </p>
        <button
          type="button"
          onClick={() => setItineraryOpen(true)}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] text-[17px] font-bold text-white shadow-lg shadow-blue-500/20 active:scale-[0.99]"
        >
          Read full itinerary
        </button>
      </div>

      <MobileItineraryReader
        open={itineraryOpen}
        onClose={() => setItineraryOpen(false)}
        tripName={trip?.name ?? "Your trip"}
        tripStartDate={trip?.startDate ?? null}
        tripEndDate={trip?.endDate ?? null}
        reservations={reservations}
        dayNotes={dayNotes}
        stopRanges={stopRanges}
        onDayNoteChange={onDayNoteChange}
        onReservationTap={onReservationTap}
      />

      <div className="flex gap-2 rounded-2xl bg-[var(--bg-muted)] p-1">
        {MOBILE_TRIPS_SEGMENTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSegment(id)}
            className={`min-h-[48px] flex-1 rounded-xl font-bold transition ${
              segment === id
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)]"
            } ${segment === id ? "text-[17px]" : "text-[16px]"}`}
          >
            {label}
          </button>
        ))}
      </div>

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
        />
      ) : segment === "hotels" ? (
        <HotelsTab
          reservations={hotels}
          mapReservations={hotels}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddBooking}
          simplifiedMobile
        />
      ) : tickets.length > 0 ? (
        <div className="space-y-3">
          {tickets.map((reservation) => (
            <TicketCard key={reservation.id} reservation={reservation} onTap={onReservationTap} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-card)] p-6 text-center">
          <p className="text-base font-semibold text-[var(--text-primary)]">No other tickets yet</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Trains, rides, and dining show up here.</p>
          <button
            type="button"
            onClick={onAddBooking}
            className="mt-4 min-h-[48px] rounded-xl bg-[var(--text-primary)] px-5 text-[15px] font-bold text-[var(--bg-base)]"
          >
            Add booking
          </button>
        </div>
      )}
    </section>
  );
}
