/**
 * Travel-day flight view — compose stored booking legs into one honest Home lead.
 * Never invent flight numbers; merge BRI→FCO + FCO→VCE under Z84T4Z into BRI→VCE gospel.
 */

import {
  flightDepartureUtcMs,
  selectTravelDayPrimaryFlight,
  sortFlightsByDeparture,
} from "@/lib/travelAssistant/flightSort";
import type { HomeTravelDayFlight } from "@/lib/travelAssistant/homeTravelDayCoach";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";

export function parseAirportsFromRouteTitle(title?: string | null): {
  dep?: string;
  arr?: string;
} {
  const raw = (title ?? "").trim();
  const match = raw.match(/\b([A-Z]{3})\s*[-–—→>]+\s*([A-Z]{3})\b/i);
  if (!match) return {};
  return { dep: match[1].toUpperCase(), arr: match[2].toUpperCase() };
}

/** Fill missing IATA codes from title like "BRI-VCE" when email import stored route-only rows. */
export function normalizeTravelDayFlightReservation(row: HomeStayReservation): HomeStayReservation {
  const dep = row.flightDepartureAirport?.trim();
  const arr = row.flightArrivalAirport?.trim();
  if (dep && arr) return row;
  const fromTitle = parseAirportsFromRouteTitle(row.title ?? row.location);
  if (!fromTitle.dep || !fromTitle.arr) return row;
  return {
    ...row,
    flightDepartureAirport: dep ?? fromTitle.dep,
    flightArrivalAirport: arr ?? fromTitle.arr,
  };
}

function hasStoredFlightDepartureTime(reservation: HomeStayReservation): boolean {
  const raw = reservation.flightDepartureTime ?? reservation.localTime ?? "";
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/u.test(raw.trim());
}

export function isBookedFlightReservation(reservation: HomeStayReservation): boolean {
  if ((reservation.type ?? "").toLowerCase() !== "flight") return false;
  if (reservation.plannedOnly === true) return false;
  if (reservation.flightDepartureAirport?.trim() || reservation.flightNumber?.trim()) return true;
  const fromTitle = parseAirportsFromRouteTitle(reservation.title ?? reservation.location);
  if (fromTitle.dep && fromTitle.arr) return true;
  // Live ITA summary row: Z84T4Z with times but no segment flight number or route title.
  if (reservation.confirmationCode?.trim() && hasStoredFlightDepartureTime(reservation)) return true;
  return false;
}

function groupFlightsByConfirmation(
  flights: readonly HomeStayReservation[],
): Map<string, HomeStayReservation[]> {
  const map = new Map<string, HomeStayReservation[]>();
  for (const flight of flights) {
    const code = flight.confirmationCode?.trim();
    if (!code) continue;
    const bucket = map.get(code) ?? [];
    bucket.push(flight);
    map.set(code, bucket);
  }
  return map;
}

function pickBriToVceChain(
  legs: readonly HomeStayReservation[],
): HomeStayReservation | null {
  if (legs.length === 0) return null;
  const ordered = sortFlightsByDeparture(legs.map(normalizeTravelDayFlightReservation));
  const summary = ordered.find((leg) => {
    const dep = (leg.flightDepartureAirport ?? "").trim().toUpperCase();
    const arr = (leg.flightArrivalAirport ?? "").trim().toUpperCase();
    return dep === "BRI" && arr === "VCE";
  });
  if (summary) return summary;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return null;
  const briStart = (first.flightDepartureAirport ?? "").trim().toUpperCase() === "BRI";
  const vceEnd = (last.flightArrivalAirport ?? "").trim().toUpperCase() === "VCE";
  if (briStart && vceEnd && ordered.length > 1) return first;
  return null;
}

export interface TravelDayFlightPick {
  primary: HomeStayReservation;
  chainLegs: HomeStayReservation[];
}

/**
 * Primary flight for a train+flight travel day — prefers BRI→VCE booking (Z84T4Z chain)
 * over an earlier BRI→FCO connector leg stored as its own reservation.
 */
export function selectTravelDayPrimaryFlightReservation(
  flights: readonly HomeStayReservation[],
  options?: { afterTrainDepartureUtcMs?: number | null },
): TravelDayFlightPick | null {
  const normalized = flights.map(normalizeTravelDayFlightReservation);
  if (normalized.length === 0) return null;

  const afterMs = options?.afterTrainDepartureUtcMs;
  let pool = normalized;
  if (afterMs != null && Number.isFinite(afterMs)) {
    const afterTrain = normalized.filter((flight) => {
      const ms = flightDepartureUtcMs(flight);
      return Number.isFinite(ms) && ms >= afterMs;
    });
    if (afterTrain.length > 0) pool = afterTrain;
  }

  for (const legs of groupFlightsByConfirmation(pool).values()) {
    const chainPrimary = pickBriToVceChain(legs);
    if (chainPrimary) {
      const code = chainPrimary.confirmationCode?.trim();
      const chainLegs = code
        ? sortFlightsByDeparture(
            normalized.filter((leg) => leg.confirmationCode?.trim() === code),
          )
        : sortFlightsByDeparture(legs);
      return { primary: chainPrimary, chainLegs };
    }
  }

  const direct = selectTravelDayPrimaryFlight(pool, options) as HomeStayReservation | null;
  if (!direct) return null;
  const code = direct.confirmationCode?.trim();
  const chainLegs = code
    ? sortFlightsByDeparture(normalized.filter((leg) => leg.confirmationCode?.trim() === code))
    : [direct];
  return { primary: direct, chainLegs };
}

export function composeTravelDayFlightView(pick: TravelDayFlightPick): HomeTravelDayFlight {
  const ordered = sortFlightsByDeparture(pick.chainLegs.map(normalizeTravelDayFlightReservation));
  const first = ordered[0] ?? pick.primary;
  const last = ordered[ordered.length - 1] ?? pick.primary;
  const useChain =
    ordered.length > 1 &&
    (first.flightDepartureAirport ?? "").trim().toUpperCase() === "BRI" &&
    (last.flightArrivalAirport ?? "").trim().toUpperCase() === "VCE";

  const summaryLeg = ordered.find((leg) => {
    const dep = (leg.flightDepartureAirport ?? "").trim().toUpperCase();
    const arr = (leg.flightArrivalAirport ?? "").trim().toUpperCase();
    return dep === "BRI" && arr === "VCE";
  });

  const storedStops = ordered.find(
    (leg) => leg.flightConnectionStops != null && Number.isFinite(leg.flightConnectionStops),
  )?.flightConnectionStops;

  const connectionStops =
    storedStops != null
      ? storedStops
      : useChain && ordered.length >= 2
        ? ordered.length - 1
        : pick.primary.flightConnectionStops;

  const omitSegmentFlightNumber = useChain && ordered.length > 1 && !summaryLeg?.flightNumber?.trim();

  return {
    id: summaryLeg?.id ?? pick.primary.id,
    flightNumber: omitSegmentFlightNumber
      ? undefined
      : (summaryLeg?.flightNumber ?? pick.primary.flightNumber)?.trim() || undefined,
    flightDepartureAirport: useChain
      ? first.flightDepartureAirport
      : pick.primary.flightDepartureAirport,
    flightArrivalAirport: useChain ? last.flightArrivalAirport : pick.primary.flightArrivalAirport,
    flightDepartureTime: useChain
      ? summaryLeg?.flightDepartureTime ??
        summaryLeg?.localTime ??
        first.flightDepartureTime ??
        first.localTime
      : pick.primary.flightDepartureTime ?? pick.primary.localTime,
    flightArrivalTime: useChain
      ? summaryLeg?.flightArrivalTime ?? last.flightArrivalTime
      : pick.primary.flightArrivalTime,
    flightArrivalTerminal: useChain
      ? summaryLeg?.flightArrivalTerminal ?? last.flightArrivalTerminal ?? pick.primary.flightArrivalTerminal
      : pick.primary.flightArrivalTerminal,
    flightConnectionStops: connectionStops,
    confirmationCode: pick.primary.confirmationCode,
    provider: pick.primary.provider ?? summaryLeg?.provider,
  };
}

export function mergeTravelDayFlightReservation(
  pick: TravelDayFlightPick,
): HomeStayReservation {
  const view = composeTravelDayFlightView(pick);
  const base = pick.chainLegs.find((leg) => leg.id === view.id) ?? pick.primary;
  return {
    ...base,
    flightNumber: view.flightNumber,
    flightDepartureAirport: view.flightDepartureAirport,
    flightArrivalAirport: view.flightArrivalAirport,
    flightDepartureTime: view.flightDepartureTime,
    flightArrivalTime: view.flightArrivalTime,
    flightArrivalTerminal: view.flightArrivalTerminal,
    flightConnectionStops: view.flightConnectionStops,
    confirmationCode: view.confirmationCode ?? base.confirmationCode,
    provider: view.provider ?? base.provider,
  };
}
