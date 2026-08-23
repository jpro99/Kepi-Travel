/**
 * Builds Home TripWalk airport spotlight from booked + observed facts (G46/G47).
 */

import {
  buildAirportHomeSpotlight,
  buildArrivalDayCoachPath,
  buildDepartDayCoachPath,
  deriveAirportDayCoachMode,
  formatLiveBaggageCarouselNote,
  resolveArrivalSpotlightIndex,
  resolveDepartSpotlightIndex,
  type DayCoachPathStep,
} from "@/lib/travelAssistant/airportDayCoach";
import { resolveAirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";
import {
  buildConnectionPlaybook,
  connectionPlaybookForFlight,
  resolveConnectionSpotlightIndex,
} from "@/lib/travelAssistant/connectionPlaybook";
import type { HomeNextAction } from "@/lib/travelAssistant/homeNextAction";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import type { MissionControlReservation } from "@/lib/travelAssistant/tripPhase";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { firstHotelCityAfter } from "@/lib/travelAssistant/reconcilePlanNoteWithHotels";
import type { HotelStayLegInput } from "@/lib/travelAssistant/hotelAnchoredStayLegs";

function toUtcMs(localTime: string, timezone?: string): number {
  const local = localTime?.trim() ?? "";
  const tz = timezone?.trim() || "Etc/UTC";
  if (!local) return Number.NaN;
  try {
    const [datePart = "", timePart = "00:00"] = local.split(/[ T]/);
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if (!year || !month || !day) return Number.NaN;
    const approxUtcMs = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(approxUtcMs).map((p) => [p.type, p.value]));
    const tzAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    return approxUtcMs - (tzAsUtcMs - approxUtcMs);
  } catch {
    const normalized = local.slice(0, 16).replace(" ", "T");
    return Date.parse(normalized.includes("T") ? normalized : `${normalized}T12:00:00`);
  }
}

/** First booked hotel on/after landing — not airport-inferred city (Neuro Brain). */
export function resolveArrivalHotelLabel(
  hotels: HotelStayLegInput[],
  arrivalDateKey: string | null,
  arrivalAirportCity?: string | null,
): string | null {
  const city = arrivalDateKey
    ? firstHotelCityAfter(hotels, arrivalDateKey, arrivalAirportCity ?? undefined)
    : null;
  if (city) return city;

  const hotel = hotels.find((h) => h.type === "hotel");
  if (!hotel) return null;
  return (
    reservationPropertyName({
      type: hotel.type,
      title: hotel.title,
      provider: hotel.provider,
      location: hotel.location,
    }).trim() || null
  );
}

function buildCoachPathSteps(input: {
  mode: ReturnType<typeof deriveAirportDayCoachMode>;
  iata: string;
  flight: MissionControlReservation;
  hotelLabel?: string | null;
  liveBaggage?: string | null;
  credentials: { tsaPreCheck: boolean; clear: boolean; globalEntry: boolean };
}): DayCoachPathStep[] {
  if (input.mode === "arrive") {
    return buildArrivalDayCoachPath({
      iata: input.iata,
      flightNumber: input.flight.flightNumber,
      airlineName: input.flight.flightAirline ?? input.flight.provider,
      departureIata: input.flight.flightDepartureAirport,
      arrivalTerminal: input.flight.flightArrivalTerminal,
      hotelLabel: input.hotelLabel,
      baggageCarouselNote: formatLiveBaggageCarouselNote(input.liveBaggage),
      flightArrivalTime: input.flight.flightArrivalTime,
      flightTimezone: input.flight.timezone,
    });
  }

  return buildDepartDayCoachPath({
    iata: input.iata,
    airlineName: input.flight.flightAirline ?? input.flight.provider,
    flightNumber: input.flight.flightNumber,
    gateCode: input.flight.flightDepartureGate,
    departureTerminal: input.flight.flightDepartureTerminal,
    credentials: input.credentials,
    eligibleLoungeNames: [],
  });
}

export function resolveAirportSpotlightForHome(input: {
  journeyPhase?: JourneyPhase;
  locationStatus?: string;
  atAirport?: boolean;
  openAirportMode?: boolean;
  nextFlight?: MissionControlReservation | null;
  reservations?: MissionControlReservation[];
  liveDepartureGate?: string | null;
  liveBaggageClaim?: string | null;
  hotelLabel?: string | null;
  credentials?: { tsaPreCheck?: boolean; clear?: boolean; globalEntry?: boolean; hasLoungeAccess?: boolean };
  nowMs?: number;
}): HomeNextAction | null {
  const atAirport = input.atAirport || input.openAirportMode;
  const travelDay =
    input.journeyPhase?.kind === "just-landed" ||
    input.journeyPhase?.kind === "airborne" ||
    atAirport;
  if (!travelDay) return null;

  const nowMs = input.nowMs ?? Date.now();
  const transportReservations = (input.reservations ?? []) as TransportRouteReservation[];

  const connectionPlaybook = buildConnectionPlaybook(transportReservations, nowMs);
  if (connectionPlaybook && (connectionPlaybook.risk === "tight" || connectionPlaybook.risk === "impossible")) {
    const connIdx = resolveConnectionSpotlightIndex(connectionPlaybook, {
      locationStatus: input.locationStatus,
    });
    const connStep = connectionPlaybook.steps[connIdx] ?? connectionPlaybook.steps[0] ?? null;
    if (connStep) {
      return buildAirportHomeSpotlight({
        mode: "depart",
        steps: [],
        currentIndex: 0,
        connectionPlaybook,
        connectionStep: connStep,
      });
    }
  }

  let flight: MissionControlReservation | null = null;
  let landedMinutesAgo: number | null = null;

  if (input.journeyPhase?.kind === "just-landed") {
    flight = input.journeyPhase.flight as MissionControlReservation;
    landedMinutesAgo = input.journeyPhase.landedMinutesAgo;
  } else if (input.nextFlight) {
    flight = input.nextFlight;
  }

  if (!flight) return null;

  const mode = deriveAirportDayCoachMode(input.journeyPhase);
  const iata =
    mode === "arrive"
      ? (flight.flightArrivalAirport ?? "").trim().toUpperCase()
      : (flight.flightDepartureAirport ?? "").trim().toUpperCase();
  if (!iata) return null;

  const creds = {
    tsaPreCheck: input.credentials?.tsaPreCheck ?? false,
    clear: input.credentials?.clear ?? false,
    globalEntry: input.credentials?.globalEntry ?? false,
  };

  const steps = buildCoachPathSteps({
    mode,
    iata,
    flight,
    hotelLabel: input.hotelLabel,
    liveBaggage: input.liveBaggageClaim,
    credentials: creds,
  });

  let currentIndex = 0;
  if (mode === "arrive") {
    currentIndex = resolveArrivalSpotlightIndex({
      steps,
      landedMinutesAgo,
      locationStatus: input.locationStatus,
      hasLiveBaggage: Boolean(formatLiveBaggageCarouselNote(input.liveBaggageClaim)),
    });
  } else {
    const deptUtc = toUtcMs(
      flight.flightDepartureTime ?? flight.localTime ?? "",
      flight.timezone,
    );
    const locationPhase = Number.isFinite(deptUtc)
      ? resolveAirportLocationPhase({
          departureUtcMs: deptUtc,
          nowMs,
          locationStatus: input.locationStatus ?? "unknown",
          hasLoungeAccess: input.credentials?.hasLoungeAccess,
        })
      : "check-in";
    currentIndex = resolveDepartSpotlightIndex(steps, locationPhase);

    const inboundPlaybook = connectionPlaybookForFlight(transportReservations, flight.id, nowMs);
    if (inboundPlaybook) {
      const connIdx = resolveConnectionSpotlightIndex(inboundPlaybook, {
        locationStatus: input.locationStatus,
        minutesSinceLanding: landedMinutesAgo,
      });
      const connStep = inboundPlaybook.steps[connIdx];
      if (connStep) {
        return buildAirportHomeSpotlight({
          mode,
          steps,
          currentIndex,
          locationPhase,
          gateCode: input.liveDepartureGate ?? flight.flightDepartureGate,
          minutesToDeparture: Number.isFinite(deptUtc) ? (deptUtc - nowMs) / 60_000 : null,
          hotelLabel: input.hotelLabel,
          connectionPlaybook: inboundPlaybook,
          connectionStep: connStep,
        });
      }
    }
  }

  const deptUtc =
    mode === "depart"
      ? toUtcMs(flight.flightDepartureTime ?? flight.localTime ?? "", flight.timezone)
      : Number.NaN;
  const locationPhase =
    mode === "depart" && Number.isFinite(deptUtc)
      ? resolveAirportLocationPhase({
          departureUtcMs: deptUtc,
          nowMs,
          locationStatus: input.locationStatus ?? "unknown",
          hasLoungeAccess: input.credentials?.hasLoungeAccess,
        })
      : undefined;

  return buildAirportHomeSpotlight({
    mode,
    steps,
    currentIndex,
    locationPhase,
    gateCode: input.liveDepartureGate ?? flight.flightDepartureGate,
    minutesToDeparture:
      mode === "depart" && Number.isFinite(deptUtc) ? (deptUtc - nowMs) / 60_000 : null,
    hotelLabel: input.hotelLabel,
  });
}
