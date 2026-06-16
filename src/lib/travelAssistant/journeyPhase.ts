/**
 * Single source of truth for where the traveler is in their journey.
 * Uses UTC-correct flight times — never browser-local date heuristics alone.
 */

export interface JourneyReservation {
  id: string;
  type: string;
  localTime: string;
  timezone?: string;
  provider?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightNumber?: string;
  checkOutDate?: string;
}

export type JourneyPhase =
  | { kind: "pre-trip"; daysUntil: number; nextFlight: JourneyReservation }
  | { kind: "airborne"; onFlight: JourneyReservation; landingAt: string; landingIn: string }
  | { kind: "just-landed"; flight: JourneyReservation; landedMinutesAgo: number }
  /** Trip fully ended — show empty state and plan-next-trip, not celebration UI. */
  | { kind: "post-trip"; lastDestination?: string }
  | { kind: "no-trip" };

/** Consumer shell tabs — phase picks the best default surface. */
export type JourneyConsumerTab = "trip" | "flights" | "hotels" | "map" | "more";

export function defaultConsumerTabForPhase(phase: JourneyPhase, nowMs: number = Date.now()): JourneyConsumerTab {
  if (phase.kind === "airborne" || phase.kind === "just-landed") {
    return "flights";
  }
  if (phase.kind === "pre-trip") {
    const depMs = flightDepartureUtcMs(phase.nextFlight);
    if (!Number.isNaN(depMs)) {
      const hoursUntil = (depMs - nowMs) / (60 * 60 * 1000);
      return hoursUntil <= 24 ? "flights" : "trip";
    }
    return phase.daysUntil <= 1 ? "flights" : "trip";
  }
  return "trip";
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
/** After final arrival, stay in just-landed / active mode briefly before post-trip. */
const POST_ARRIVAL_ACTIVE_MS = 6 * 60 * MS_PER_MIN;
/** After last trip event, switch to post-trip. */
const POST_TRIP_GRACE_MS = 24 * 60 * MS_PER_MIN;

export function toUtcMs(localTime: string, timezone?: string): number {
  const normalized = localTime.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(normalized);
  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute);

  const tz = timezone?.trim();
  if (!tz) return approxUtcMs;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(approxUtcMs)).map((p) => [p.type, p.value]));
    const tzAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const offsetMs = tzAsUtcMs - approxUtcMs;
    return approxUtcMs - offsetMs;
  } catch {
    return approxUtcMs;
  }
}

function flightDepartureUtcMs(flight: JourneyReservation): number {
  const candidates = [flight.flightDepartureTime, flight.localTime, flight.flightDate ? `${flight.flightDate} 12:00` : ""];
  for (const value of candidates) {
    if (!value?.trim()) continue;
    const ms = toUtcMs(value, flight.timezone);
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.NaN;
}

function flightArrivalUtcMs(flight: JourneyReservation): number {
  if (flight.flightArrivalTime?.trim()) {
    const ms = toUtcMs(flight.flightArrivalTime, flight.timezone);
    if (!Number.isNaN(ms)) return ms;
  }
  const depMs = flightDepartureUtcMs(flight);
  if (!Number.isNaN(depMs)) return depMs + 4 * 60 * MS_PER_MIN;
  return Number.NaN;
}

function hotelEndUtcMs(hotel: JourneyReservation): number {
  const checkout = hotel.checkOutDate?.trim();
  if (checkout) {
    const ms = toUtcMs(`${checkout.slice(0, 10)} 11:00`, hotel.timezone);
    if (!Number.isNaN(ms)) return ms;
  }
  const checkInMs = toUtcMs(hotel.localTime, hotel.timezone);
  if (!Number.isNaN(checkInMs)) return checkInMs + MS_PER_DAY;
  return Number.NaN;
}

function sortFlights(flights: JourneyReservation[]): JourneyReservation[] {
  return [...flights].sort((a, b) => {
    const left = flightDepartureUtcMs(a);
    const right = flightDepartureUtcMs(b);
    if (Number.isNaN(left) && Number.isNaN(right)) return 0;
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return left - right;
  });
}

function formatLandingIn(minsLeft: number): string {
  if (minsLeft < 1) return "moments";
  if (minsLeft < 60) return `${minsLeft} min`;
  return `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`;
}

function daysUntilDeparture(depMs: number, nowMs: number): number {
  if (Number.isNaN(depMs)) return 0;
  const diff = depMs - nowMs;
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

function tripEndUtcMs(flights: JourneyReservation[], hotels: JourneyReservation[]): number {
  let endMs = Number.NaN;
  for (const flight of flights) {
    const arrMs = flightArrivalUtcMs(flight);
    if (!Number.isNaN(arrMs)) {
      endMs = Number.isNaN(endMs) ? arrMs : Math.max(endMs, arrMs);
    }
  }
  for (const hotel of hotels) {
    const hotelEnd = hotelEndUtcMs(hotel);
    if (!Number.isNaN(hotelEnd)) {
      endMs = Number.isNaN(endMs) ? hotelEnd : Math.max(endMs, hotelEnd);
    }
  }
  if (Number.isNaN(endMs)) return Number.NaN;
  return endMs + POST_TRIP_GRACE_MS;
}

export function hasUpcomingTripEvents(
  reservations: JourneyReservation[],
  nowMs: number = Date.now(),
): boolean {
  const flights = reservations.filter((r) => r.type === "flight");
  const hotels = reservations.filter((r) => r.type === "hotel");
  const endMs = tripEndUtcMs(flights, hotels);
  if (!Number.isNaN(endMs) && nowMs > endMs) return false;

  for (const flight of flights) {
    const arrMs = flightArrivalUtcMs(flight);
    if (!Number.isNaN(arrMs) && nowMs < arrMs + POST_ARRIVAL_ACTIVE_MS) return true;
    const depMs = flightDepartureUtcMs(flight);
    if (!Number.isNaN(depMs) && nowMs < depMs + 30 * MS_PER_MIN) return true;
  }

  for (const hotel of hotels) {
    const end = hotelEndUtcMs(hotel);
    if (!Number.isNaN(end) && nowMs < end) return true;
  }

  return flights.some((flight) => {
    const depMs = flightDepartureUtcMs(flight);
    return !Number.isNaN(depMs) && depMs > nowMs;
  });
}

export function shouldPromptAirportTransport(
  phase: JourneyPhase,
  nowMs: number = Date.now(),
): boolean {
  if (phase.kind !== "pre-trip") return false;
  const depMs = flightDepartureUtcMs(phase.nextFlight);
  if (Number.isNaN(depMs)) return phase.daysUntil <= 1;
  const hoursUntil = (depMs - nowMs) / (60 * 60 * 1000);
  return hoursUntil <= 36;
}

export function computeJourneyPhase(args: {
  reservations: JourneyReservation[];
  nowMs?: number;
  tripDestination?: string | null;
}): JourneyPhase {
  const nowMs = args.nowMs ?? Date.now();
  const flights = sortFlights(args.reservations.filter((r) => r.type === "flight"));
  const hotels = args.reservations.filter((r) => r.type === "hotel");

  if (flights.length === 0 && hotels.length === 0) {
    return { kind: "no-trip" };
  }

  if (flights.length === 0) {
    const nextHotel = hotels.find((hotel) => {
      const end = hotelEndUtcMs(hotel);
      return Number.isNaN(end) || end > nowMs;
    });
    if (!nextHotel) {
      return { kind: "post-trip", lastDestination: args.tripDestination ?? undefined };
    }
    const checkInMs = toUtcMs(nextHotel.localTime, nextHotel.timezone);
    const daysUntil = Number.isNaN(checkInMs)
      ? 0
      : Math.max(0, Math.ceil((checkInMs - nowMs) / MS_PER_DAY));
    return {
      kind: "pre-trip",
      daysUntil,
      nextFlight: {
        ...nextHotel,
        type: "hotel",
        flightDepartureAirport: nextHotel.provider ?? "Hotel",
        flightArrivalAirport: nextHotel.provider ?? "Hotel",
      },
    };
  }

  const tripEndMs = tripEndUtcMs(flights, hotels);
  if (!Number.isNaN(tripEndMs) && nowMs > tripEndMs) {
    const lastFlight = flights[flights.length - 1];
    const lastDest =
      lastFlight?.flightArrivalAirport ??
      args.tripDestination ??
      undefined;
    return { kind: "post-trip", lastDestination: lastDest };
  }

  for (const flight of flights) {
    const depMs = flightDepartureUtcMs(flight);
    const arrMs = flightArrivalUtcMs(flight);
    if (Number.isNaN(depMs) || Number.isNaN(arrMs)) continue;

    if (nowMs >= depMs && nowMs < arrMs) {
      const minsLeft = Math.max(0, Math.round((arrMs - nowMs) / MS_PER_MIN));
      return {
        kind: "airborne",
        onFlight: flight,
        landingAt: flight.flightArrivalAirport ?? "destination",
        landingIn: formatLandingIn(minsLeft),
      };
    }

    if (nowMs >= arrMs && nowMs < arrMs + POST_ARRIVAL_ACTIVE_MS) {
      const landedMinutesAgo = Math.max(0, Math.round((nowMs - arrMs) / MS_PER_MIN));
      return { kind: "just-landed", flight, landedMinutesAgo };
    }
  }

  const nextFlight = flights.find((flight) => {
    const depMs = flightDepartureUtcMs(flight);
    return !Number.isNaN(depMs) && depMs > nowMs - 2 * MS_PER_MIN;
  });

  if (nextFlight) {
    const depMs = flightDepartureUtcMs(nextFlight);
    return {
      kind: "pre-trip",
      daysUntil: daysUntilDeparture(depMs, nowMs),
      nextFlight,
    };
  }

  const lastFlight = flights[flights.length - 1];
  const lastArr = flightArrivalUtcMs(lastFlight);
  if (!Number.isNaN(lastArr) && nowMs >= lastArr + POST_ARRIVAL_ACTIVE_MS) {
    return {
      kind: "post-trip",
      lastDestination: lastFlight.flightArrivalAirport ?? args.tripDestination ?? undefined,
    };
  }

  return { kind: "post-trip", lastDestination: args.tripDestination ?? undefined };
}
