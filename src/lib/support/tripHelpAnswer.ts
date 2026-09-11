/**
 * Deterministic Kepi Help answers from booked trip facts — never invent gates,
 * platforms, or drive times.
 */

import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { buildTripTransportRoute, type TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

export interface TripHelpReservation {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  hotelSearchCity?: string;
  localTime?: string;
  checkOutDate?: string;
  timezone?: string;
  trainNumber?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightDate?: string;
  hasPdfAttachment?: boolean;
  originalEmailText?: string;
  notes?: string;
}

export interface TripHelpContext {
  tripName?: string | null;
  destination?: string | null;
  todayKey: string;
  locationStatus?: string | null;
  journeyPhase?: string | null;
  reservations: TripHelpReservation[];
}

const EC261_PATTERN =
  /\b(ec\s*261|eu\s*261|261\/2004|denied\s+boarding|overbook|compensation|passenger\s+rights)\b/iu;
const WHERE_AM_I_PATTERN = /\b(where\s+am\s+i|what\s+city\s+am\s+i\s+in|where\s+are\s+we)\b/iu;
const NEXT_TRAVEL_DAY_PATTERN =
  /\b(next\s+travel\s+day|when\s+do\s+i\s+leave|what'?s\s+next|next\s+move|checkout|check\s*out)\b/iu;
const PLAN_CITY_DAY_PATTERN = /\b(plan\s+(?:a\s+)?city\s+day|plan\s+city|city\s+day\s+plan)\b/iu;
const TRAIN_TIME_PATTERN =
  /\b(train|rail|trenitalia|platform|depart|departure\s+time)\b/iu;

function dateOnly(value: string | null | undefined): string {
  return value?.trim().slice(0, 10) ?? "";
}

function hotelCoversDay(hotel: TripHelpReservation, dateKey: string): boolean {
  const start = dateOnly(hotel.localTime);
  if (!start) return false;
  const end = dateOnly(hotel.checkOutDate) || start;
  return start <= dateKey && dateKey < end;
}

function stayCityLabel(hotel: TripHelpReservation): string {
  return (
    hotel.hotelSearchCity?.trim() ||
    deriveHotelSearchCityFromReservation(hotel) ||
    hotel.location?.trim() ||
    hotel.title?.trim() ||
    ""
  );
}

function resolveActiveStay(
  reservations: TripHelpReservation[],
  todayKey: string,
): TripHelpReservation | null {
  const hotels = reservations.filter((row) => row.type === "hotel" && hotelCoversDay(row, todayKey));
  if (hotels.length === 0) return null;
  if (hotels.length === 1) return hotels[0]!;
  return hotels
    .slice()
    .sort((left, right) => {
      const leftCheckout = dateOnly(left.checkOutDate);
      const rightCheckout = dateOnly(right.checkOutDate);
      if (leftCheckout && rightCheckout && leftCheckout !== rightCheckout) {
        return leftCheckout.localeCompare(rightCheckout);
      }
      return stayCityLabel(left).localeCompare(stayCityLabel(right));
    })[0] ?? null;
}

function formatLocalDate(dateKey: string): string {
  const parsed = Date.parse(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed)) return dateKey;
  return new Date(parsed).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTrainLine(train: TripHelpReservation): string {
  const when = train.localTime?.trim() || train.flightDepartureTime?.trim() || "";
  const timePart = when.includes(" ") ? when.split(" ").slice(1).join(" ") : when;
  const route = train.location?.trim() || "";
  const number = train.trainNumber?.trim() || train.title?.trim() || "Train";
  const provider = train.provider?.trim();
  const ticketHint =
    train.hasPdfAttachment || train.originalEmailText?.trim()
      ? "Your ticket is on this trip — open it from Home or Plan."
      : train.confirmationCode
        ? `Confirmation ${train.confirmationCode}.`
        : "No ticket artifact on file yet — check your email or Plan.";
  return [
    provider ? `${provider} ${number}` : number,
    route,
    timePart ? `departs ${timePart}` : null,
    ticketHint,
  ]
    .filter(Boolean)
    .join(" · ");
}

function resolveNextTravelMove(
  reservations: TripHelpReservation[],
  todayKey: string,
): { dateKey: string; headline: string; detail: string; kind: "train" | "flight" | "checkout" } | null {
  const transport = reservations.filter((row) =>
    ["flight", "train", "ride"].includes((row.type ?? "").toLowerCase()),
  ) as TransportRouteReservation[];
  const route = buildTripTransportRoute(transport);
  const upcoming = route.segments
    .filter((segment) => segment.booked && segment.departMs != null)
    .map((segment) => ({
      dateKey: segment.sortKey.slice(0, 10),
      departMs: segment.departMs ?? 0,
      label: segment.headline,
      from: segment.fromLabel,
      to: segment.toLabel,
      kind: segment.kind,
      reservationId: segment.reservationId,
    }))
    .filter((segment) => segment.dateKey > todayKey)
    .sort((left, right) => left.departMs - right.departMs);

  if (upcoming.length > 0) {
    const next = upcoming[0]!;
    const reservation = reservations.find((row) => row.id === next.reservationId);
    if (next.kind === "train" && reservation) {
      return {
        dateKey: next.dateKey,
        kind: "train",
        headline: `${formatLocalDate(next.dateKey)} — ${next.from} → ${next.to}`,
        detail: formatTrainLine(reservation),
      };
    }
    return {
      dateKey: next.dateKey,
      kind: next.kind === "flight" ? "flight" : "train",
      headline: `${formatLocalDate(next.dateKey)} — ${next.label}`,
      detail: reservation?.flightNumber
        ? `${reservation.flightNumber} · ${reservation.flightDepartureAirport ?? ""} → ${reservation.flightArrivalAirport ?? ""}`
        : next.label,
    };
  }

  const stay = resolveActiveStay(reservations, todayKey);
  const checkout = dateOnly(stay?.checkOutDate);
  if (stay && checkout && checkout > todayKey) {
    const city = stayCityLabel(stay);
    return {
      dateKey: checkout,
      kind: "checkout",
      headline: `${formatLocalDate(checkout)} — checkout from ${city || stay.title || "your stay"}`,
      detail: stay.title?.trim()
        ? `${stay.title.trim()} checkout is on your trip calendar.`
        : "Checkout is on your trip calendar.",
    };
  }

  return null;
}

function answerWhereAmI(ctx: TripHelpContext): string | null {
  const stay = resolveActiveStay(ctx.reservations, ctx.todayKey);
  if (stay) {
    const city = stayCityLabel(stay);
    const lodging = stay.title?.trim();
    if (lodging && city) {
      return `You're in ${city} — ${lodging} is on your trip for tonight (${ctx.todayKey}).`;
    }
    if (city) {
      return `You're in ${city} based on your booked stay for ${ctx.todayKey}.`;
    }
  }

  if (ctx.locationStatus === "at-airport" || ctx.locationStatus === "in-terminal") {
    return "You're at the airport according to your phone — open Airport Mode for gate and walk guidance from your booked flight.";
  }
  if (ctx.journeyPhase?.includes("airborne")) {
    return "You're in flight right now — I'll use your landing flight from the trip when you ask about connections.";
  }
  if (ctx.destination?.trim()) {
    return `I don't see a stay booked for ${ctx.todayKey}. Your trip destination is ${ctx.destination.trim()} — check Plan for the latest bookings.`;
  }
  return null;
}

function answerNextTravelDay(ctx: TripHelpContext): string | null {
  const move = resolveNextTravelMove(ctx.reservations, ctx.todayKey);
  if (!move) {
    return "I don't see a next travel day on your trip yet — forward a train, flight, or hotel confirmation and I'll line it up.";
  }

  if (move.kind === "train") {
    const sameDayTrains = ctx.reservations
      .filter((row) => row.type === "train" && dateOnly(row.localTime) === move.dateKey)
      .sort((left, right) => (left.localTime ?? "").localeCompare(right.localTime ?? ""));
    const trainLines = sameDayTrains.map(formatTrainLine);
    const flightSameDay = ctx.reservations.find(
      (row) =>
        row.type === "flight" &&
        dateOnly(row.flightDepartureTime ?? row.flightDate ?? row.localTime) === move.dateKey,
    );
    const parts = [...trainLines];
    if (flightSameDay) {
      const dep = flightSameDay.flightDepartureTime ?? flightSameDay.localTime ?? "";
      const timePart = dep.includes(" ") ? dep.split(" ").slice(1).join(" ") : dep;
      parts.push(
        [
          flightSameDay.flightNumber ?? "Flight",
          `${flightSameDay.flightDepartureAirport ?? ""} → ${flightSameDay.flightArrivalAirport ?? ""}`.trim(),
          timePart ? `departs ${timePart}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }
    return `Your next travel day is ${move.headline}. ${parts.join(" Then ")}`;
  }

  return `Your next travel day is ${move.headline}. ${move.detail}`;
}

function answerTrainQuestion(ctx: TripHelpContext): string | null {
  const trains = ctx.reservations
    .filter((row) => row.type === "train")
    .slice()
    .sort((left, right) => dateOnly(left.localTime).localeCompare(dateOnly(right.localTime)));
  const upcoming = trains.filter((train) => dateOnly(train.localTime) >= ctx.todayKey);
  const target = upcoming[0] ?? trains[trains.length - 1];
  if (!target) return null;
  return formatTrainLine(target);
}

function answerPlanCityDay(ctx: TripHelpContext): string {
  const stay = resolveActiveStay(ctx.reservations, ctx.todayKey);
  const city = stay ? stayCityLabel(stay) : ctx.destination?.trim() ?? "";
  if (city) {
    return `Open Plan City for ${city} — pick sourced stops (OSM + official lists), set your pace, and save onto your trip day plan. Tap Plan a city day again to open it.`;
  }
  return "Open Plan City from the Plan tab — pick a stay city on your trip or search any city. Every stop needs provenance; we never invent gelato spots.";
}

function answerEc261(): string {
  return [
    "EU Regulation (EC) No 261/2004 covers denied boarding, cancellation, and long delays on many flights to/from the EU.",
    "Care (meals, hotel, rebooking) and fixed compensation bands depend on distance and the airline's reason — Kepi does not file claims.",
    "Ask your airline for written confirmation of the disruption reason, keep boarding passes, and check the national enforcement body for your departure country.",
    "Official text: EUR-Lex 32004R0261.",
  ].join(" ");
}

/**
 * Returns a factual answer from trip data when the question matches a known pattern.
 * Returns null when AI or a clarifying question is more appropriate.
 */
export function tryAnswerTripQuestion(question: string, ctx: TripHelpContext): string | null {
  const normalized = question.trim();
  if (!normalized) return null;

  if (EC261_PATTERN.test(normalized)) {
    return answerEc261();
  }
  if (PLAN_CITY_DAY_PATTERN.test(normalized)) {
    return answerPlanCityDay(ctx);
  }
  if (WHERE_AM_I_PATTERN.test(normalized)) {
    return answerWhereAmI(ctx);
  }
  if (NEXT_TRAVEL_DAY_PATTERN.test(normalized)) {
    return answerNextTravelDay(ctx);
  }
  if (TRAIN_TIME_PATTERN.test(normalized) && ctx.reservations.some((row) => row.type === "train")) {
    return answerTrainQuestion(ctx);
  }
  return null;
}

export function buildTripHelpContextFromLiveStorage(input: {
  todayKey: string;
}): TripHelpContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("kepi:support-live-context");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      tripName?: string;
      destination?: string;
      locationStatus?: string;
      journeyPhase?: string;
      reservationsJson?: string;
    };
    const reservations = parsed.reservationsJson
      ? (JSON.parse(parsed.reservationsJson) as TripHelpReservation[])
      : [];
    if (!Array.isArray(reservations)) return null;
    return {
      tripName: parsed.tripName ?? null,
      destination: parsed.destination ?? null,
      todayKey: input.todayKey,
      locationStatus: parsed.locationStatus ?? null,
      journeyPhase: parsed.journeyPhase ?? null,
      reservations,
    };
  } catch {
    return null;
  }
}
