import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { airportServesStayCity } from "@/lib/travelAssistant/metroAirportCoverage";
import type { FlightLegPlan } from "@/lib/decision/types";
import type { TripGroundTransportInput } from "@/lib/travelAssistant/quickGroundTransport";

export interface BookedHopFlight {
  id: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  localTime?: string;
  title?: string;
  location?: string;
  provider?: string;
}

export interface BookedHopCoverage {
  covered: boolean;
  summary?: string;
  reservationId?: string;
}

const PLACE_GROUPS: string[][] = [
  ["venice", "venezia", "venezia s lucia", "venezia santa lucia", "santa lucia", "vce", "marco polo"],
  ["lecce", "bds"],
  ["brindisi", "bds"],
  ["bari", "bri"],
  ["rome", "roma", "fco", "fiumicino"],
  ["cortina", "cortina dampezzo", "cortina d ampezzo"],
];

function normalizePlace(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function groupIndexFor(text: string): number {
  const key = normalizePlace(text);
  if (!key) return -1;
  return PLACE_GROUPS.findIndex((group) =>
    group.some((alias) => key === alias || key.includes(alias) || alias.includes(key)),
  );
}

/** Venice ≡ Venezia S. Lucia ≡ VCE. Used for booked-fact matching only. */
export function placesLikelySame(a: string, b: string): boolean {
  if (citiesLikelySame(a, b)) return true;
  const left = groupIndexFor(a);
  const right = groupIndexFor(b);
  return left >= 0 && left === right;
}

export function isoDay(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const slice = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

export function hopDateWindow(departureDate: string | undefined): { start: string; end: string } | null {
  const day = isoDay(departureDate);
  if (!day) return null;
  const center = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(center)) return null;
  return {
    start: new Date(center - 86_400_000).toISOString().slice(0, 10),
    end: new Date(center + 86_400_000).toISOString().slice(0, 10),
  };
}

export function dayInHopWindow(day: string | null, departureDate: string | undefined): boolean {
  if (!day) return false;
  const window = hopDateWindow(departureDate);
  if (!window) return true;
  return day >= window.start && day <= window.end;
}

function flightDay(flight: BookedHopFlight): string | null {
  return isoDay(flight.flightDate) ?? isoDay(flight.flightDepartureTime) ?? isoDay(flight.localTime);
}

function flightBlob(flight: BookedHopFlight): string {
  return [flight.title, flight.location, flight.provider, flight.flightNumber].filter(Boolean).join(" ");
}

function groundBlob(transport: TripGroundTransportInput): string {
  return [transport.title, transport.location, transport.provider].filter(Boolean).join(" ");
}

function mentionsPlace(blob: string, place: string, iata?: string): boolean {
  if (!blob.trim()) return false;
  if (placesLikelySame(blob, place)) return true;
  if (iata && new RegExp(`\\b${iata}\\b`, "i").test(blob)) return true;
  return normalizePlace(blob)
    .split(" ")
    .filter((token) => token.length >= 3)
    .some((token) => placesLikelySame(token, place));
}

function flightCoversHop(leg: FlightLegPlan, flight: BookedHopFlight): BookedHopCoverage | null {
  const day = flightDay(flight);
  if (leg.departureDate && day && !dayInHopWindow(day, leg.departureDate)) return null;

  const dep = flight.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const arr = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
  const fromIata = leg.fromIata?.trim().toUpperCase() ?? "";
  const toIata = leg.toIata?.trim().toUpperCase() ?? "";
  const summary =
    [flight.flightNumber?.trim(), dep && arr ? `${dep}→${arr}` : flight.title?.trim()]
      .filter(Boolean)
      .join(" · ") || "Booked flight";

  if (arr && toIata && arr === toIata) {
    return { covered: true, summary, reservationId: flight.id };
  }
  if (arr && airportServesStayCity(arr, leg.toLabel)) {
    return { covered: true, summary, reservationId: flight.id };
  }
  if (dep && fromIata && dep === fromIata) {
    return { covered: true, summary, reservationId: flight.id };
  }
  if (dep && airportServesStayCity(dep, leg.fromLabel)) {
    return { covered: true, summary, reservationId: flight.id };
  }
  const blob = flightBlob(flight);
  if (mentionsPlace(blob, leg.toLabel, toIata) || (arr && placesLikelySame(arr, leg.toLabel))) {
    return { covered: true, summary, reservationId: flight.id };
  }
  return null;
}

function groundCoversHop(leg: FlightLegPlan, transport: TripGroundTransportInput): BookedHopCoverage | null {
  if (transport.type !== "ride" && transport.type !== "train") return null;
  if (transport.plannedOnly) return null;
  const code = transport.confirmationCode?.trim().toUpperCase() ?? "";
  if (code === "PLANNED") return null;

  const provider = transport.provider?.trim() || (transport.type === "train" ? "Train" : "Ride");
  const blob = groundBlob(transport);
  const day = isoDay(transport.localTime);
  const inWindow = dayInHopWindow(day, leg.departureDate);
  const mentionsFrom = mentionsPlace(blob, leg.fromLabel, leg.fromIata);
  const mentionsTo = mentionsPlace(blob, leg.toLabel, leg.toIata);

  if (mentionsFrom && mentionsTo) {
    return { covered: true, summary: provider, reservationId: transport.id };
  }
  if (inWindow) {
    return { covered: true, summary: provider, reservationId: transport.id };
  }
  if (!day && (mentionsFrom || mentionsTo) && blob.trim()) {
    return { covered: true, summary: provider, reservationId: transport.id };
  }
  return null;
}

/**
 * Apple hop truth: a hotel-city move is covered when a booked flight or
 * train/ride already serves that date window. Invented BDS→VCE pairs must
 * not override a Venice-arriving flight or a Trenitalia PDF.
 */
export function coverHopWithBookedFacts(
  leg: FlightLegPlan,
  flights: BookedHopFlight[],
  ground: TripGroundTransportInput[],
): BookedHopCoverage {
  for (const flight of flights) {
    const hit = flightCoversHop(leg, flight);
    if (hit) return hit;
  }
  for (const transport of ground) {
    const hit = groundCoversHop(leg, transport);
    if (hit) return hit;
  }
  return { covered: false };
}
