"use client";

import { useState } from "react";
import { airportToCity } from "@/lib/travelAssistant/buildTripLegs";
import { cityPhotoPicsumUrl, cityPhotoUrl } from "@/lib/travelAssistant/cityPhotos";

interface HeroReservation {
  type: string;
  location?: string;
  flightArrivalAirport?: string;
}

export function resolveHeroCity(
  destination: string | null | undefined,
  reservations: HeroReservation[],
): string {
  if (destination?.trim()) {
    return destination.split(/[,/]/u)[0]?.trim() || destination.trim();
  }
  const hotel = reservations.find((reservation) => reservation.type === "hotel" && reservation.location?.trim());
  if (hotel?.location) {
    return hotel.location.split(/[,/]/u)[0]?.trim() || hotel.location;
  }
  const flight = reservations.find(
    (reservation) => reservation.type === "flight" && reservation.flightArrivalAirport?.trim(),
  );
  if (flight?.flightArrivalAirport) {
    return airportToCity(flight.flightArrivalAirport);
  }
  return "Your destination";
}

export function DestinationHeroPhoto({ city, className = "" }: { city: string; className?: string }) {
  const [src, setSrc] = useState(() => cityPhotoUrl(city, 1200));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
      onError={() => setSrc(cityPhotoPicsumUrl(city))}
    />
  );
}
