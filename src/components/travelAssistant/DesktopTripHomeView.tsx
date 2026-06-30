"use client";

import { TripRouteBanner } from "@/components/travelAssistant/TripRouteBanner";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

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
  transportReservations: TransportRouteReservation[];
  reservations: TripReservation[];
  onReservationTap: (id: string) => void;
}

function fmtDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw ?? "");
  if (!m) return "";
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime12(raw: string): string {
  const m = /(\d{2}):(\d{2})/.exec(raw.slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function flightSummary(flight: TripReservation): string {
  const dep = flight.flightDepartureAirport ?? "---";
  const arr = flight.flightArrivalAirport ?? "---";
  const parts = [
    `${dep} → ${arr}`,
    flight.flightNumber,
    fmtTime12(flight.flightDepartureTime ?? flight.localTime ?? ""),
    fmtDate(flight.flightDate ?? flight.localTime ?? ""),
  ].filter(Boolean);
  return parts.join(" · ");
}

function hotelSummary(hotel: TripReservation): string {
  const checkIn = fmtDate(hotel.localTime);
  const checkOut = hotel.checkOutDate ? fmtDate(hotel.checkOutDate) : "";
  return [hotel.location || hotel.title, checkIn, checkOut ? `out ${checkOut}` : ""].filter(Boolean).join(" · ");
}

export function DesktopTripHomeView({
  tripName,
  transportReservations,
  reservations,
  onReservationTap,
}: DesktopTripHomeViewProps) {
  const flights = reservations.filter((r) => r.type === "flight");
  const hotels = reservations.filter((r) => r.type === "hotel");

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{tripName}</h1>

      <TripRouteBanner transportReservations={transportReservations} />

      {flights.length > 0 ? (
        <section className="space-y-3">
          {flights.map((flight) => (
            <button
              key={flight.id}
              type="button"
              onClick={() => onReservationTap(flight.id)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500/40"
            >
              <p className="text-xl font-bold text-slate-950 dark:text-white">
                {flight.flightAirline?.trim() || flight.provider?.trim() || "Flight"}
              </p>
              <p className="mt-1 text-base text-slate-600 dark:text-slate-300">{flightSummary(flight)}</p>
            </button>
          ))}
        </section>
      ) : null}

      {hotels.length > 0 ? (
        <section className="space-y-3">
          {hotels.map((hotel) => (
            <button
              key={hotel.id}
              type="button"
              onClick={() => onReservationTap(hotel.id)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
            >
              <p className="text-xl font-bold text-slate-950 dark:text-white">
                {hotel.provider?.trim() || hotel.title?.trim() || "Hotel"}
              </p>
              <p className="mt-1 text-base text-slate-600 dark:text-slate-300">{hotelSummary(hotel)}</p>
            </button>
          ))}
        </section>
      ) : null}
    </section>
  );
}
