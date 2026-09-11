/**
 * Day-level train ticket handoff — opens stored ticket/manage/email artifacts.
 * Never invents PNRs, barcodes, or provider URLs.
 */

import { isSafeExternalHttpsUrl } from "@/lib/travelAssistant/checkInHandoff";
import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";
import {
  buildReservationQuickLinks,
  buildSourceEmailViewPath,
  reservationHasSourceEmail,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";

export interface TrainTicketSourceReservation extends ReservationLinkInput {
  id: string;
  title?: string;
  trainNumber?: string;
  timezone?: string | null;
  plannedOnly?: boolean;
  boardingPassUrl?: string;
}

export interface TrainTicketOpenTarget {
  url: string;
  label: string;
  isExternal: boolean;
}

export interface TrainPassengerTicketAction {
  passengerName: string;
  actionLabel: string;
  actionUrl: string;
}

export interface TrainTicketHandoffContent {
  reservationId: string;
  headline: string;
  detail: string;
  primaryActionLabel: string;
  primaryActionUrl: string;
  passengerTickets: TrainPassengerTicketAction[];
  honestyNote: string;
}

export function isOpenableTicketUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  return isSafeExternalHttpsUrl(trimmed);
}

export function trainReservationDateKey(reservation: TrainTicketSourceReservation): string | null {
  const raw = reservation.localTime?.trim() ?? "";
  if (raw.length < 10) return null;
  return raw.slice(0, 10);
}

/** Booked train on the trip — not a planned placeholder leg. */
export function isBookedTrainReservation(reservation: TrainTicketSourceReservation): boolean {
  if ((reservation.type ?? "").toLowerCase() !== "train") return false;
  if (reservation.plannedOnly === true) return false;
  if (isPlannedReservation(reservation)) return false;
  return true;
}

export function trainReservationsOnDay(
  reservations: TrainTicketSourceReservation[],
  dateKey: string,
): TrainTicketSourceReservation[] {
  return reservations
    .filter(isBookedTrainReservation)
    .filter((reservation) => trainReservationDateKey(reservation) === dateKey)
    .sort((a, b) => (a.localTime ?? "").localeCompare(b.localTime ?? ""));
}

function formatTrainTime(localTime: string | undefined): string | null {
  const match = (localTime ?? "").match(/\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/u);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function trainHeadline(reservation: TrainTicketSourceReservation): string {
  const route = reservation.location?.trim();
  const title = reservation.title?.trim();
  const provider = reservation.provider?.trim();
  const trainNo = reservation.trainNumber?.trim();
  const label = [provider, trainNo || title].filter(Boolean).join(" ");
  if (label && route) return `${label} · ${route}`;
  return label || route || "Train";
}

function trainDetail(reservation: TrainTicketSourceReservation): string {
  const time = formatTrainTime(reservation.localTime);
  const code = reservation.confirmationCode?.trim();
  const bits: string[] = [];
  if (time) bits.push(`Departs ${time}`);
  if (code) bits.push(`Confirmation ${code}`);
  return bits.join(" · ") || "Your booked train for today.";
}

function isStoredInAppUrl(url: string): boolean {
  return url.trim().startsWith("/");
}

/** True when Kepi holds a ticket artifact (PDF, forwarded email, in-app pass URL). */
export function reservationHasStoredTicketArtifact(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): boolean {
  const boardingPass = reservation.boardingPassUrl?.trim();
  if (boardingPass && isOpenableTicketUrl(boardingPass) && isStoredInAppUrl(boardingPass)) {
    return true;
  }
  if (
    reservation.sourceLinks?.some(
      (link) => link.kind === "ticket" && link.url?.trim() && isStoredInAppUrl(link.url),
    )
  ) {
    return true;
  }
  if (tripId && reservationHasSourceEmail(reservation)) return true;
  if (boardingPass && isOpenableTicketUrl(boardingPass)) return true;
  return false;
}

/**
 * Stored ticket artifacts first — in-app source-view / PDF / barcode before any provider lookup.
 * Never invents Trenitalia deep links or barcodes.
 */
function resolveStoredTicketTarget(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainTicketOpenTarget | null {
  const boardingPass = reservation.boardingPassUrl?.trim();
  if (boardingPass && isOpenableTicketUrl(boardingPass) && isStoredInAppUrl(boardingPass)) {
    return { url: boardingPass, label: "Train tickets", isExternal: false };
  }

  for (const link of reservation.sourceLinks ?? []) {
    const url = link.url?.trim() ?? "";
    if (link.kind === "ticket" && url && isStoredInAppUrl(url) && isOpenableTicketUrl(url)) {
      return { url, label: "Train tickets", isExternal: false };
    }
  }

  if (tripId && reservationHasSourceEmail(reservation)) {
    return {
      url: buildSourceEmailViewPath(tripId, reservation.id),
      label: "Train tickets",
      isExternal: false,
    };
  }

  if (boardingPass && isOpenableTicketUrl(boardingPass)) {
    return {
      url: boardingPass,
      label: "Train tickets",
      isExternal: !isStoredInAppUrl(boardingPass),
    };
  }

  return null;
}

/** External manage/ticket links only when no stored artifact exists on the reservation. */
function resolveExternalTicketTarget(
  reservation: TrainTicketSourceReservation,
): TrainTicketOpenTarget | null {
  const manageUrl = reservation.manageUrl?.trim();
  if (manageUrl && isOpenableTicketUrl(manageUrl)) {
    return { url: manageUrl, label: "Train tickets", isExternal: true };
  }

  for (const link of reservation.sourceLinks ?? []) {
    const url = link.url?.trim() ?? "";
    if (
      (link.kind === "ticket" || link.kind === "manage") &&
      url &&
      !isStoredInAppUrl(url) &&
      isOpenableTicketUrl(url)
    ) {
      return { url, label: "Train tickets", isExternal: true };
    }
  }

  const quickLinks = buildReservationQuickLinks(reservation);
  const quickTicket = quickLinks.find((link) => link.kind === "ticket" || link.kind === "manage");
  if (quickTicket?.url && isOpenableTicketUrl(quickTicket.url)) {
    return {
      url: quickTicket.url,
      label: "Train tickets",
      isExternal: !isStoredInAppUrl(quickTicket.url),
    };
  }

  return null;
}

/** Prefer stored in-app artifact, then external manage/ticket URL when nothing is stored. */
export function resolveTrainTicketOpenTarget(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainTicketOpenTarget | null {
  const stored = resolveStoredTicketTarget(reservation, tripId);
  if (stored) return stored;
  return resolveExternalTicketTarget(reservation);
}

function collectPassengerTicketActions(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainPassengerTicketAction[] {
  const passengerLinks = (reservation.sourceLinks ?? []).filter(
    (link) => link.kind === "ticket" && link.url?.trim() && isOpenableTicketUrl(link.url),
  );
  const namedPassengers = passengerLinks.filter((link) => {
    const label = link.label.trim();
    return label.length > 0 && !/^(train tickets|view ticket|boarding pass)/iu.test(label);
  });

  if (namedPassengers.length >= 2) {
    return namedPassengers.map((link) => ({
      passengerName: link.label.trim(),
      actionLabel: link.label.trim(),
      actionUrl: link.url.trim(),
    }));
  }

  if (tripId && reservationHasSourceEmail(reservation) && namedPassengers.length === 0) {
    return [];
  }

  return [];
}

export function buildTrainTicketHandoffContent(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainTicketHandoffContent | null {
  if (!isBookedTrainReservation(reservation)) return null;
  const target = resolveTrainTicketOpenTarget(reservation, tripId);
  if (!target) return null;

  const passengerTickets = collectPassengerTicketActions(reservation, tripId);

  const honestyNote = target.isExternal
    ? target.url === reservation.manageUrl?.trim()
      ? "Opens your booking provider — we do not generate rail barcodes."
      : "Opens your stored booking link — we do not generate rail barcodes."
    : reservation.hasPdfAttachment
      ? "Opens your stored ticket PDF or forwarded confirmation in Kepi."
      : reservation.boardingPassUrl?.trim()
        ? "Opens your stored boarding pass."
        : "Opens your forwarded confirmation in Kepi.";

  return {
    reservationId: reservation.id,
    headline: trainHeadline(reservation),
    detail: trainDetail(reservation),
    primaryActionLabel: target.label,
    primaryActionUrl: target.url,
    passengerTickets,
    honestyNote,
  };
}

export function resolveTrainTicketsForDay(
  reservations: TrainTicketSourceReservation[],
  dateKey: string,
  tripId?: string | null,
): TrainTicketHandoffContent[] {
  return trainReservationsOnDay(reservations, dateKey)
    .map((reservation) => buildTrainTicketHandoffContent(reservation, tripId))
    .filter((content): content is TrainTicketHandoffContent => Boolean(content));
}

export function resolveTodayTrainTicketHandoffs(
  reservations: TrainTicketSourceReservation[],
  nowMs = Date.now(),
  tripId?: string | null,
): TrainTicketHandoffContent[] {
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  return resolveTrainTicketsForDay(reservations, todayKey, tripId);
}
