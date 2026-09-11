/**
 * Day-level flight boarding-pass / ticket handoff — opens stored artifacts only.
 * Never invents flight numbers, gates, barcodes, or provider URLs.
 */

import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";
import {
  buildReservationQuickLinks,
  buildSourceEmailViewPath,
  reservationHasSourceEmail,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";
import { canonicalFlightDepartureDay } from "@/lib/travelAssistant/tripWindow";
import {
  collectPassengerTicketActions,
  isOpenableTicketUrl,
  reservationHasStoredTicketArtifact,
  type TrainPassengerTicketAction,
  type TrainTicketHandoffContent,
  type TrainTicketOpenTarget,
} from "@/lib/travelAssistant/trainTicketHandoff";

export type FlightTicketSourceReservation = ReservationLinkInput & {
  id: string;
  type?: string;
  title?: string;
  provider?: string;
  timezone?: string | null;
  plannedOnly?: boolean;
  boardingPassUrl?: string;
  confirmationCode?: string | null;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightArrivalTerminal?: string;
  flightConnectionStops?: number;
  localTime?: string;
};

export type FlightPassengerTicketAction = TrainPassengerTicketAction;
export type FlightTicketHandoffContent = TrainTicketHandoffContent;

function isStoredInAppUrl(url: string): boolean {
  return url.trim().startsWith("/");
}

/** Booked flight on the trip — not a planned placeholder leg. */
export function isBookedFlightTicketReservation(reservation: FlightTicketSourceReservation): boolean {
  if ((reservation.type ?? "").toLowerCase() !== "flight") return false;
  if (reservation.plannedOnly === true) return false;
  if (isPlannedReservation(reservation)) return false;
  const dep = reservation.flightDepartureAirport?.trim();
  const arr = reservation.flightArrivalAirport?.trim();
  if (dep || reservation.flightNumber?.trim()) return true;
  if (dep && arr) return true;
  if (reservation.confirmationCode?.trim() && (reservation.flightDepartureTime ?? reservation.localTime)?.trim()) {
    return true;
  }
  return false;
}

export function flightReservationDateKey(reservation: FlightTicketSourceReservation): string | null {
  const fromFlight = canonicalFlightDepartureDay(reservation);
  if (fromFlight) return fromFlight;
  const raw = reservation.localTime?.trim() ?? "";
  if (raw.length < 10) return null;
  return raw.slice(0, 10);
}

function formatFlightTime(localTime: string | undefined): string | null {
  const match = (localTime ?? "").match(/\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/u);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function formatFlightConnectionStops(stops?: number | null): string | null {
  if (stops == null || !Number.isFinite(stops)) return null;
  if (stops === 0) return "Nonstop";
  if (stops === 1) return "1 stop";
  return `${stops} stops`;
}

function flightHeadline(reservation: FlightTicketSourceReservation): string {
  const from = reservation.flightDepartureAirport?.trim() || "";
  const to = reservation.flightArrivalAirport?.trim() || "";
  const route = from && to ? `${from} → ${to}` : "";
  const num = reservation.flightNumber?.trim();
  const conf = reservation.confirmationCode?.trim();
  const bits = [
    conf ? `Confirmation ${conf}` : null,
    route || null,
    num || null,
    reservation.provider?.trim() || reservation.title?.trim() || null,
  ].filter(Boolean);
  return bits.join(" · ") || route || reservation.title?.trim() || "Flight";
}

function flightDetail(reservation: FlightTicketSourceReservation): string {
  const time = formatFlightTime(reservation.flightDepartureTime ?? reservation.localTime);
  const arrival = formatFlightTime(reservation.flightArrivalTime);
  const stops = formatFlightConnectionStops(reservation.flightConnectionStops);
  const term = reservation.flightArrivalTerminal?.trim();
  const bits: string[] = [];
  if (time && arrival) bits.push(`Departs ${time} · Arrives ${arrival}`);
  else if (time) bits.push(`Departs ${time}`);
  if (stops) bits.push(stops);
  if (term && reservation.flightArrivalAirport?.trim()) {
    bits.push(`${reservation.flightArrivalAirport.trim()} T${term}`);
  }
  return bits.join(" · ") || "Your booked flight for today.";
}

function resolveStoredFlightTicketTarget(
  reservation: FlightTicketSourceReservation,
  tripId?: string | null,
): TrainTicketOpenTarget | null {
  const boardingPass = reservation.boardingPassUrl?.trim();
  if (boardingPass && isOpenableTicketUrl(boardingPass) && isStoredInAppUrl(boardingPass)) {
    return { url: boardingPass, label: "Boarding passes", isExternal: false };
  }

  for (const link of reservation.sourceLinks ?? []) {
    const url = link.url?.trim() ?? "";
    if (link.kind === "ticket" && url && isStoredInAppUrl(url) && isOpenableTicketUrl(url)) {
      return { url, label: "Boarding passes", isExternal: false };
    }
  }

  if (tripId && reservationHasSourceEmail(reservation)) {
    return {
      url: buildSourceEmailViewPath(tripId, reservation.id),
      label: "Boarding passes",
      isExternal: false,
    };
  }

  if (boardingPass && isOpenableTicketUrl(boardingPass)) {
    return {
      url: boardingPass,
      label: "Boarding passes",
      isExternal: !isStoredInAppUrl(boardingPass),
    };
  }

  return null;
}

function resolveExternalFlightTicketTarget(
  reservation: FlightTicketSourceReservation,
): TrainTicketOpenTarget | null {
  const manageUrl = reservation.manageUrl?.trim();
  if (manageUrl && isOpenableTicketUrl(manageUrl)) {
    return { url: manageUrl, label: "Flight tickets", isExternal: true };
  }

  for (const link of reservation.sourceLinks ?? []) {
    const url = link.url?.trim() ?? "";
    if (
      (link.kind === "ticket" || link.kind === "manage" || link.kind === "checkin") &&
      url &&
      !isStoredInAppUrl(url) &&
      isOpenableTicketUrl(url)
    ) {
      return { url, label: "Boarding passes", isExternal: true };
    }
  }

  const quickLinks = buildReservationQuickLinks(reservation);
  const quickTicket = quickLinks.find(
    (link) => link.kind === "ticket" || link.kind === "manage" || link.kind === "checkin",
  );
  if (quickTicket?.url && isOpenableTicketUrl(quickTicket.url)) {
    return {
      url: quickTicket.url,
      label: "Boarding passes",
      isExternal: !isStoredInAppUrl(quickTicket.url),
    };
  }

  return null;
}

export function resolveFlightTicketOpenTarget(
  reservation: FlightTicketSourceReservation,
  tripId?: string | null,
): TrainTicketOpenTarget | null {
  const stored = resolveStoredFlightTicketTarget(reservation, tripId);
  if (stored) return stored;
  return resolveExternalFlightTicketTarget(reservation);
}

export function flightReservationHasStoredTicketArtifact(
  reservation: FlightTicketSourceReservation,
  tripId?: string | null,
): boolean {
  return reservationHasStoredTicketArtifact(reservation, tripId);
}

export function buildFlightTicketHandoffContent(
  reservation: FlightTicketSourceReservation,
  tripId?: string | null,
): FlightTicketHandoffContent | null {
  if (!isBookedFlightTicketReservation(reservation)) return null;
  if (!flightReservationHasStoredTicketArtifact(reservation, tripId)) return null;
  const target = resolveFlightTicketOpenTarget(reservation, tripId);
  if (!target) return null;

  const passengerTickets = collectPassengerTicketActions(reservation, tripId);

  const honestyNote = target.isExternal
    ? "Opens your airline or stored booking link — Kepi does not generate boarding passes."
    : reservation.hasPdfAttachment
      ? "Opens your stored boarding-pass PDF or forwarded confirmation in Kepi."
      : reservation.boardingPassUrl?.trim()
        ? "Opens your stored boarding pass."
        : passengerTickets.length >= 2
          ? "Opens each passenger's stored boarding pass in Kepi."
          : "Opens your forwarded confirmation in Kepi.";

  return {
    reservationId: reservation.id,
    headline: flightHeadline(reservation),
    detail: flightDetail(reservation),
    primaryActionLabel: target.label,
    primaryActionUrl: target.url,
    passengerTickets,
    honestyNote,
  };
}
