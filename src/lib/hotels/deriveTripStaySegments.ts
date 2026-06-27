import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { resolveHotelDestination } from "@/lib/hotels/resolveDestination";
import {
  classifyStayStop,
  resolveStayIntent,
  type StayIntent,
  type StayStopKind,
  type SuggestedStayIntent,
} from "@/lib/hotels/classifyStayStop";

export type TripStaySegmentStatus = "missing" | "booked" | "partial" | "skipped";

export interface TripStaySegmentInput {
  id: string;
  city: string;
  cityIata?: string;
  checkIn: string;
  checkOut: string;
  source: "flight" | "trip" | "manual" | "gap";
}

export interface TripStaySegment extends TripStaySegmentInput {
  nights: number;
  status: TripStaySegmentStatus;
  reservationId?: string;
  reservationTitle?: string;
  label: string;
  stopKind: StayStopKind;
  stayIntent: StayIntent;
  suggestedIntent: SuggestedStayIntent;
  intentReason: string;
  connectionHours: number | null;
  needsDecision: boolean;
}

export interface DeriveTripStaySegmentsInput {
  tripDestination?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  flights: Array<{
    id: string;
    flightArrivalAirport?: string;
    flightDepartureAirport?: string;
    flightArrivalTime?: string;
    flightDepartureTime?: string;
    flightDate?: string;
    localTime?: string;
  }>;
  hotels: Array<{
    id: string;
    title?: string;
    provider?: string;
    location?: string;
    localTime?: string;
    checkOutDate?: string;
  }>;
  manualSegments?: TripStaySegmentInput[];
  /** Per-segment user decisions keyed by segment id. */
  stayDecisions?: Record<string, StayIntent | "needs_hotel" | "skip">;
  usuallySkipsConnections?: boolean;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const slice = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`);
  return Math.max(0, Math.round(diff / 86_400_000));
}

function flightDay(f: DeriveTripStaySegmentsInput["flights"][0], kind: "arrival" | "departure"): string | null {
  if (kind === "arrival") {
    return isoDate(f.flightArrivalTime) ?? isoDate(f.flightDate) ?? isoDate(f.localTime);
  }
  return isoDate(f.flightDepartureTime) ?? isoDate(f.flightDate) ?? isoDate(f.localTime);
}

function flightMs(f: DeriveTripStaySegmentsInput["flights"][0], kind: "arrival" | "departure"): number | null {
  const raw =
    kind === "arrival"
      ? f.flightArrivalTime ?? f.flightDate ?? f.localTime
      : f.flightDepartureTime ?? f.flightDate ?? f.localTime;
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(normalized);
  if (!match) return null;
  const [, y, mo, d, h = "12", mi = "0"] = match;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return Number.isNaN(ms) ? null : ms;
}

function hotelCheckout(h: DeriveTripStaySegmentsInput["hotels"][0]): string | null {
  return isoDate(h.checkOutDate);
}

function locationHaystack(h: DeriveTripStaySegmentsInput["hotels"][0]): string {
  return `${h.location ?? ""} ${h.title ?? ""} ${h.provider ?? ""}`.toLowerCase();
}

function cityMatchesHotel(city: string, hotel: DeriveTripStaySegmentsInput["hotels"][0]): boolean {
  const cityLower = city.toLowerCase();
  const stem = cityLower.split(",")[0]?.trim() ?? cityLower;
  const haystack = locationHaystack(hotel);
  return haystack.includes(stem) || (stem.length >= 4 && haystack.includes(stem.slice(0, 4)));
}

function segmentBookingStatus(
  segment: TripStaySegmentInput,
  hotels: DeriveTripStaySegmentsInput["hotels"],
): Pick<TripStaySegment, "status" | "reservationId" | "reservationTitle"> {
  for (const hotel of hotels) {
    const checkIn = isoDate(hotel.localTime);
    const checkOut = hotelCheckout(hotel) ?? (checkIn ? addDays(checkIn, 1) : null);
    if (!checkIn || !checkOut) continue;
    if (!cityMatchesHotel(segment.city, hotel)) continue;

    const coversStart = checkIn <= segment.checkIn && checkOut > segment.checkIn;
    const coversEnd = checkIn < segment.checkOut && checkOut >= segment.checkOut;
    const fullyCovers = checkIn <= segment.checkIn && checkOut >= segment.checkOut;

    if (fullyCovers) {
      return {
        status: "booked",
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
      };
    }
    if (coversStart || coversEnd) {
      return {
        status: "partial",
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
      };
    }
  }
  return { status: "missing" };
}

function buildSegmentLabel(
  city: string,
  checkIn: string,
  checkOut: string,
  nights: number,
  stopKind: StayStopKind,
): string {
  const cityLabel = city.split("(")[0]?.trim() || city;
  if (stopKind === "connection") {
    return `${cityLabel} · ${checkIn} · connection only`;
  }
  if (nights === 0) {
    return `${cityLabel} · ${checkIn}`;
  }
  return `${cityLabel} · ${checkIn} → ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`;
}

/** Break a trip into city stops for guided hotel planning. */
export function deriveTripStaySegments(input: DeriveTripStaySegmentsInput): TripStaySegment[] {
  const manual = input.manualSegments ?? [];
  const tripStart = isoDate(input.tripStartDate);
  const tripEnd = isoDate(input.tripEndDate);
  const today = new Date().toISOString().slice(0, 10);
  const decisions = input.stayDecisions ?? {};

  const rawSegments: TripStaySegmentInput[] = [...manual];

  const sortedFlights = [...input.flights].sort((a, b) => {
    const aDay = flightDay(a, "arrival") ?? flightDay(a, "departure") ?? "";
    const bDay = flightDay(b, "arrival") ?? flightDay(b, "departure") ?? "";
    return aDay.localeCompare(bDay);
  });

  for (let index = 0; index < sortedFlights.length; index++) {
    const flight = sortedFlights[index];
    const arrivalDay = flightDay(flight, "arrival");
    const arrivalAirport = flight.flightArrivalAirport?.trim();
    if (!arrivalDay || !arrivalAirport) continue;

    const formatted = formatHotelSearchCityLabel(arrivalAirport);
    const nextFlight = sortedFlights[index + 1];
    const nextDepartureDay = nextFlight ? flightDay(nextFlight, "departure") : null;

    let checkIn = arrivalDay;
    if (tripStart && checkIn < tripStart) checkIn = tripStart;
    if (checkIn < today) checkIn = today;

    let checkOut = nextDepartureDay ?? tripEnd ?? addDays(checkIn, 3);
    if (nextDepartureDay && checkOut <= checkIn) checkOut = nextDepartureDay;
    if (!nextDepartureDay && checkOut <= checkIn) checkOut = addDays(checkIn, 3);
    if (tripEnd && checkOut > tripEnd) checkOut = tripEnd;

    rawSegments.push({
      id: `flight-${flight.id}-${index}`,
      city: formatted.label || arrivalAirport,
      cityIata: formatted.iata || undefined,
      checkIn,
      checkOut,
      source: "flight",
    });
  }

  if (rawSegments.length === 0 && input.tripDestination?.trim()) {
    const formatted = formatHotelSearchCityLabel(input.tripDestination);
    const checkIn = tripStart && tripStart >= today ? tripStart : addDays(today, 7);
    let checkOut = tripEnd ?? addDays(checkIn, 3);
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 3);
    rawSegments.push({
      id: "trip-destination",
      city: formatted.label || input.tripDestination.trim(),
      cityIata: formatted.iata || undefined,
      checkIn,
      checkOut,
      source: "trip",
    });
  }

  const deduped = rawSegments.filter(
    (segment, idx, arr) =>
      arr.findIndex(
        (other) =>
          other.city.toLowerCase() === segment.city.toLowerCase() &&
          other.checkIn === segment.checkIn &&
          other.checkOut === segment.checkOut,
      ) === idx,
  );

  return deduped
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map((segment) => {
      const nights = nightsBetween(segment.checkIn, segment.checkOut);
      const booking = segmentBookingStatus(segment, input.hotels);
      const isBooked = booking.status === "booked" || booking.status === "partial";

      const flightIndex = segment.source === "flight" ? sortedFlights.findIndex((f, i) => segment.id === `flight-${f.id}-${i}`) : -1;
      const nextFlight = flightIndex >= 0 ? sortedFlights[flightIndex + 1] : null;
      const classification =
        segment.source === "manual" || segment.source === "trip"
          ? {
              stopKind: "destination" as const,
              suggestedIntent: "needs_hotel" as const,
              connectionHours: null,
              reason: "You added this city — plan a hotel unless you say otherwise.",
            }
          : classifyStayStop({
              arrivalDay: segment.checkIn,
              nextDepartureDay: segment.checkOut,
              arrivalMs: flightIndex >= 0 ? flightMs(sortedFlights[flightIndex], "arrival") : null,
              nextDepartureMs: nextFlight ? flightMs(nextFlight, "departure") : null,
              hasNextFlight: Boolean(nextFlight),
              usuallySkipsConnections: input.usuallySkipsConnections,
            });

      const storedIntent = decisions[segment.id];
      const stayIntent = resolveStayIntent({
        classification,
        userIntent: storedIntent ?? null,
        isBooked,
        usuallySkipsConnections: input.usuallySkipsConnections,
      });

      let status = booking.status;
      if (stayIntent === "skip" && !isBooked) status = "skipped";

      const cityLabel = segment.city.split("(")[0]?.trim() || segment.city;
      const needsDecision = !isBooked && stayIntent === "unknown";

      return {
        ...segment,
        nights,
        label: buildSegmentLabel(cityLabel, segment.checkIn, segment.checkOut, nights, classification.stopKind),
        stopKind: classification.stopKind,
        stayIntent,
        suggestedIntent: classification.suggestedIntent,
        intentReason: classification.reason,
        connectionHours: classification.connectionHours,
        needsDecision,
        status,
        ...booking,
      };
    });
}

/** Segments that still need a hotel booked. */
export function segmentsNeedingHotel(segments: TripStaySegment[]): TripStaySegment[] {
  return segments.filter(
    (segment) =>
      segment.stayIntent === "needs_hotel" &&
      (segment.status === "missing" || segment.status === "partial"),
  );
}

/** First segment that still needs a hotel — used for "Search next stay" CTA. */
export function nextMissingStaySegment(segments: TripStaySegment[]): TripStaySegment | null {
  return segmentsNeedingHotel(segments)[0] ?? null;
}

/** Stops waiting for a yes/no hotel decision. */
export function segmentsAwaitingDecision(segments: TripStaySegment[]): TripStaySegment[] {
  return segments.filter((segment) => segment.needsDecision);
}

/** Async helper to enrich manual city names with display labels. */
export async function normalizeManualStayCity(raw: string): Promise<{ city: string; cityIata: string }> {
  const resolved = await resolveHotelDestination(raw);
  if (resolved) {
    return {
      city: resolved.displayName,
      cityIata: resolved.iata ?? "",
    };
  }
  const formatted = formatHotelSearchCityLabel(raw);
  return { city: formatted.label || raw.trim(), cityIata: formatted.iata };
}
