/**
 * Travel-day flight boarding-pass handoff — per leg, per passenger.
 * Any IATA / any airline; mirrors trainTicketHandoff; never invents gates or seats.
 */

import {
  factsForStoredLeg,
  formatBoardingPassLegDetail,
  sectionTextForPassengerLeg,
} from "@/lib/travelAssistant/flightBoardingPassFacts";
import {
  legSlugFromRoute,
  type BoardingPassRoute,
} from "@/lib/travelAssistant/flightBoardingPassIngest";
import { reservationHasStoredBoardingPassArtifacts } from "@/lib/travelAssistant/flightBoardingPassStored";
import { isOpenableTicketUrl } from "@/lib/travelAssistant/trainTicketHandoff";
import { isBookedFlightReservation } from "@/lib/travelAssistant/travelDayFlightView";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";
import type { TrainPassengerTicketAction } from "@/lib/travelAssistant/trainTicketHandoff";
import { passengerSlugFromName } from "@/lib/travelAssistant/railPassengerTicketLinks";

export interface FlightBoardingPassHandoffContent {
  reservationId: string;
  legLabel: string;
  legSlug: string;
  headline: string;
  detail: string;
  passengerTickets: TrainPassengerTicketAction[];
  honestyNote: string;
}

export interface FlightBoardingPassSourceReservation extends HomeStayReservation {
  sourceLinks?: Array<{ label: string; url: string; kind: string }>;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
  boardingPassUrl?: string;
}

function flightDateKey(reservation: FlightBoardingPassSourceReservation): string | null {
  const raw = reservation.flightDepartureTime ?? reservation.localTime ?? reservation.flightDate ?? "";
  if (raw.length < 10) return null;
  return raw.slice(0, 10);
}

export function flightsOnTravelDay(
  reservations: FlightBoardingPassSourceReservation[],
  dateKey: string,
): FlightBoardingPassSourceReservation[] {
  return reservations
    .filter(isBookedFlightReservation)
    .filter((row) => flightDateKey(row) === dateKey)
    .sort((a, b) =>
      (a.flightDepartureTime ?? a.localTime ?? "").localeCompare(
        b.flightDepartureTime ?? b.localTime ?? "",
      ),
    );
}

function parseLegFromUrl(url: string): string | null {
  try {
    const leg = new URL(url, "https://kepitravel.com").searchParams.get("leg")?.trim();
    return leg || null;
  } catch {
    return null;
  }
}

function parsePassengerFromUrl(url: string): string | null {
  try {
    const passenger = new URL(url, "https://kepitravel.com").searchParams.get("passenger")?.trim();
    return passenger || null;
  } catch {
    return null;
  }
}

function legLabelFromSlug(slug: string): string {
  const [dep, arr] = slug.split("-");
  if (dep?.length === 3 && arr?.length === 3) {
    return `${dep.toUpperCase()} → ${arr.toUpperCase()}`;
  }
  return slug;
}

function routeFromLegSlug(legSlug: string): BoardingPassRoute | null {
  const [dep, arr] = legSlug.split("-");
  if (dep?.length === 3 && arr?.length === 3) {
    return { dep: dep.toUpperCase(), arr: arr.toUpperCase() };
  }
  return null;
}

/** Only legs with stored per-passenger ticket links — partial ingest OK. */
function discoverStoredLegSlugs(reservation: FlightBoardingPassSourceReservation): string[] {
  const slugs = new Set<string>();
  for (const link of reservation.sourceLinks ?? []) {
    if (link.kind !== "ticket") continue;
    const leg = parseLegFromUrl(link.url ?? "");
    if (leg) slugs.add(leg);
  }
  return [...slugs];
}

function collectPassengerTicketsForLeg(
  reservation: FlightBoardingPassSourceReservation,
  legSlug: string,
): TrainPassengerTicketAction[] {
  const tickets: TrainPassengerTicketAction[] = [];
  for (const link of reservation.sourceLinks ?? []) {
    if (link.kind !== "ticket" || !link.url?.trim() || !isOpenableTicketUrl(link.url)) continue;
    const linkLeg = parseLegFromUrl(link.url);
    if (!linkLeg || linkLeg !== legSlug) continue;
    const label = link.label.trim();
    if (!label || /^(train tickets|view ticket|boarding pass)/iu.test(label)) continue;
    tickets.push({
      passengerName: label,
      actionLabel: label,
      actionUrl: link.url.trim(),
    });
  }
  return tickets;
}

export function buildFlightBoardingPassHandoffForLeg(
  reservation: FlightBoardingPassSourceReservation,
  legSlug: string,
): FlightBoardingPassHandoffContent | null {
  const passengerTickets = collectPassengerTicketsForLeg(reservation, legSlug);
  if (passengerTickets.length === 0) return null;

  const legLabel = legLabelFromSlug(legSlug);
  const route = routeFromLegSlug(legSlug);
  const facts = route
    ? factsForStoredLeg(reservation.originalEmailText, route)
    : {};
  const detail = formatBoardingPassLegDetail(facts, reservation.confirmationCode);

  return {
    reservationId: reservation.id,
    legLabel,
    legSlug,
    headline: `Boarding passes · ${legLabel}`,
    detail,
    passengerTickets,
    honestyNote:
      "Opens your stored boarding-pass PDF or forwarded email — we do not generate barcodes.",
  };
}

export function resolveFlightBoardingPassesForDay(
  reservations: FlightBoardingPassSourceReservation[],
  dateKey: string,
): FlightBoardingPassHandoffContent[] {
  const flights = flightsOnTravelDay(reservations, dateKey).filter(
    reservationHasStoredBoardingPassArtifacts,
  );
  const handoffs: FlightBoardingPassHandoffContent[] = [];
  const seen = new Set<string>();

  for (const flight of flights) {
    for (const legSlug of discoverStoredLegSlugs(flight)) {
      const key = `${flight.id}|${legSlug}`;
      if (seen.has(key)) continue;
      const handoff = buildFlightBoardingPassHandoffForLeg(flight, legSlug);
      if (!handoff) continue;
      seen.add(key);
      handoffs.push(handoff);
    }
  }

  return handoffs.sort((a, b) => a.legLabel.localeCompare(b.legLabel));
}

export function hasStoredFlightBoardingPassesOnDay(
  reservations: FlightBoardingPassSourceReservation[],
  dateKey: string,
): boolean {
  return resolveFlightBoardingPassesForDay(reservations, dateKey).length > 0;
}

export function flightHasStoredBoardingPassArtifacts(
  reservation: FlightBoardingPassSourceReservation,
): boolean {
  return reservationHasStoredBoardingPassArtifacts(reservation);
}

export function passengerBoardingPassActionUrl(
  reservation: FlightBoardingPassSourceReservation,
  passengerName: string,
  legSlug: string,
): string | null {
  const slug = passengerSlugFromName(passengerName);
  const fromLink = (reservation.sourceLinks ?? []).find((link) => {
    if (link.kind !== "ticket" || !link.url?.trim()) return false;
    return parseLegFromUrl(link.url) === legSlug && parsePassengerFromUrl(link.url) === slug;
  });
  return fromLink?.url?.trim() ?? null;
}

export { sectionTextForPassengerLeg };
