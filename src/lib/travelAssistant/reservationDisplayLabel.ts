const OTA_PROVIDERS = new Set([
  "booking.com",
  "expedia",
  "hotels.com",
  "google",
  "hotels.com",
  "agoda",
  "priceline",
  "kayak",
  "trip.com",
  "hotwire",
]);

export interface ReservationLabelInput {
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

export function isOtaProvider(provider: string | undefined | null): boolean {
  if (!provider?.trim()) return false;
  return OTA_PROVIDERS.has(provider.trim().toLowerCase());
}

/** Prefer hotel name over OTA provider for display. */
export function reservationDisplayLabel(reservation: ReservationLabelInput): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport ?? "?";
    const arr = reservation.flightArrivalAirport ?? "?";
    return `✈ ${dep} → ${arr}`;
  }

  if (reservation.type === "hotel") {
    const title = reservation.title?.trim();
    const provider = reservation.provider?.trim();
    if (title && (!provider || isOtaProvider(provider))) return `🏨 ${title}`;
    if (title && provider) return `🏨 ${title}`;
    if (provider) return `🏨 ${provider}`;
    if (reservation.location?.trim()) return `🏨 ${reservation.location.trim()}`;
    return "🏨 Hotel";
  }

  return reservation.title?.trim() || reservation.provider?.trim() || "Reservation";
}

export function reservationProviderBadge(provider: string | undefined | null): string | null {
  if (!provider?.trim() || !isOtaProvider(provider)) return null;
  return provider.trim();
}
