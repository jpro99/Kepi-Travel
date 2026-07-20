import { extractHotelPropertyName } from "@/lib/travelAssistant/hotelPropertyName";

const OTA_PROVIDERS = new Set([
  "booking.com",
  "booking",
  "expedia",
  "hotels.com",
  "google",
  "agoda",
  "priceline",
  "kayak",
  "trip.com",
  "hotwire",
  "airbnb",
  "vrbo",
]);

export interface ReservationLabelInput {
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  notes?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

export function isOtaProvider(provider: string | undefined | null): boolean {
  if (!provider?.trim()) return false;
  const normalized = provider.trim().toLowerCase().replace(/\s+/g, "");
  if (OTA_PROVIDERS.has(normalized)) return true;
  if (OTA_PROVIDERS.has(provider.trim().toLowerCase())) return true;
  return /booking\.com|expedia|hotels\.com|airbnb|vrbo|agoda/i.test(provider);
}

/**
 * Hotel / stay property name for UI — never an OTA brand when a real name exists.
 * KEPI_DESIGN_LAW I25.
 */
export function reservationPropertyName(reservation: ReservationLabelInput): string {
  if (reservation.type !== "hotel") {
    return reservation.title?.trim() || reservation.provider?.trim() || "Reservation";
  }
  const title = reservation.title?.trim() ?? "";
  const provider = reservation.provider?.trim() ?? "";
  const location = reservation.location?.trim() ?? "";
  const notes = reservation.notes?.trim() ?? "";

  if (title && !isOtaProvider(title)) return title;
  if (provider && !isOtaProvider(provider)) return provider;
  // Salvage property name from confirmation notes when title was stored as the OTA brand.
  if (notes) {
    const fromNotes = extractHotelPropertyName("", notes);
    if (fromNotes) return fromNotes;
  }
  if (location) return location;
  if (title) return title;
  if (provider) return provider;
  return "Hotel";
}

/** Prefer a real property name when the stored title is an OTA brand (I25). */
export function coerceHotelTitle(reservation: ReservationLabelInput): string {
  if (reservation.type !== "hotel") {
    return reservation.title?.trim() || "";
  }
  const title = reservation.title?.trim() ?? "";
  if (title && !isOtaProvider(title)) return title;
  return reservationPropertyName(reservation);
}

/** Prefer hotel name over OTA provider for display. */
export function reservationDisplayLabel(reservation: ReservationLabelInput): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport ?? "?";
    const arr = reservation.flightArrivalAirport ?? "?";
    return `✈ ${dep} → ${arr}`;
  }

  if (reservation.type === "hotel") {
    return `🏨 ${reservationPropertyName(reservation)}`;
  }

  return reservation.title?.trim() || reservation.provider?.trim() || "Reservation";
}

export function reservationProviderBadge(provider: string | undefined | null): string | null {
  if (!provider?.trim() || !isOtaProvider(provider)) return null;
  // Normalize common short forms for the badge.
  const raw = provider.trim();
  if (/^booking$/i.test(raw)) return "Booking.com";
  return raw;
}
