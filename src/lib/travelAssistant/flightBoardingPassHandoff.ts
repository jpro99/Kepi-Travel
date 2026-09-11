/**
 * Travel-day flight boarding-pass handoff — per leg, per passenger.
 * Mirrors trainTicketHandoff; never invents gates, seats, or barcodes.
 */

import { isOpenableTicketUrl } from "@/lib/travelAssistant/trainTicketHandoff";
import { isBookedFlightReservation } from "@/lib/travelAssistant/travelDayFlightView";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";
import { legSlugFromRoute } from "@/lib/travelAssistant/flightBoardingPassIngest";
import type { TrainPassengerTicketAction } from "@/lib/travelAssistant/trainTicketHandoff";

export interface FlightBoardingPassHandoffContent {
  reservationId: string;
  legLabel: string;
  headline: string;
  detail: string;
  passengerTickets: TrainPassengerTicketAction[];
  honestyNote: string;
}

export interface FlightBoardingPassSourceReservation extends HomeStayReservation {
  sourceLinks?: Array<{ label: string; url: string; kind: string }>;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
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

function legLabelFromSlug(slug: string): string {
  const [dep, arr] = slug.split("-");
  if (dep?.length === 3 && arr?.length === 3) {
    return `${dep.toUpperCase()} → ${arr.toUpperCase()}`;
  }
  return slug;
}

function collectPassengerTicketsForLeg(
  reservation: FlightBoardingPassSourceReservation,
  legSlug: string,
): TrainPassengerTicketAction[] {
  const tickets: TrainPassengerTicketAction[] = [];
  for (const link of reservation.sourceLinks ?? []) {
    if (link.kind !== "ticket" || !link.url?.trim() || !isOpenableTicketUrl(link.url)) continue;
    const linkLeg = parseLegFromUrl(link.url);
    if (linkLeg && linkLeg !== legSlug) continue;
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

function discoverLegSlugs(reservation: FlightBoardingPassSourceReservation): string[] {
  const slugs = new Set<string>();
  for (const link of reservation.sourceLinks ?? []) {
    if (link.kind !== "ticket") continue;
    const leg = parseLegFromUrl(link.url ?? "");
    if (leg) slugs.add(leg);
  }
  const dep = (reservation.flightDepartureAirport ?? "").trim().toUpperCase();
  const arr = (reservation.flightArrivalAirport ?? "").trim().toUpperCase();
  if (dep.length === 3 && arr.length === 3) {
    slugs.add(legSlugFromRoute({ dep, arr }));
  }
  return [...slugs];
}

export function buildFlightBoardingPassHandoffForLeg(
  reservation: FlightBoardingPassSourceReservation,
  legSlug: string,
): FlightBoardingPassHandoffContent | null {
  const passengerTickets = collectPassengerTicketsForLeg(reservation, legSlug);
  if (passengerTickets.length === 0) return null;

  const legLabel = legLabelFromSlug(legSlug);
  const conf = reservation.confirmationCode?.trim();
  const detailParts = [conf ? `Confirmation ${conf}` : null, "Stored boarding pass in Kepi"].filter(Boolean);

  return {
    reservationId: reservation.id,
    legLabel,
    headline: `Boarding passes · ${legLabel}`,
    detail: detailParts.join(" · "),
    passengerTickets,
    honestyNote: "Opens your stored boarding-pass PDF or forwarded email — we do not generate barcodes.",
  };
}

export function resolveFlightBoardingPassesForDay(
  reservations: FlightBoardingPassSourceReservation[],
  dateKey: string,
): FlightBoardingPassHandoffContent[] {
  const flights = flightsOnTravelDay(reservations, dateKey);
  const handoffs: FlightBoardingPassHandoffContent[] = [];
  const seen = new Set<string>();

  for (const flight of flights) {
    for (const legSlug of discoverLegSlugs(flight)) {
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
