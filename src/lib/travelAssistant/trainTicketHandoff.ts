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
  resolveBoardingPassUrl,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";

export interface TrainTicketSourceReservation extends ReservationLinkInput {
  id: string;
  title?: string;
  trainNumber?: string;
  plannedOnly?: boolean;
  boardingPassUrl?: string;
}

export interface TrainTicketOpenTarget {
  url: string;
  label: string;
  isExternal: boolean;
}

export interface TrainTicketHandoffContent {
  reservationId: string;
  headline: string;
  detail: string;
  primaryActionLabel: string;
  primaryActionUrl: string;
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

/** Prefer stored pass URL, then ticket links, manage booking, then forwarded email/PDF. */
export function resolveTrainTicketOpenTarget(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainTicketOpenTarget | null {
  const passUrl = resolveBoardingPassUrl({
    boardingPassUrl: reservation.boardingPassUrl,
    sourceLinks: reservation.sourceLinks,
    originalEmailText: reservation.originalEmailText,
  });
  if (passUrl && isOpenableTicketUrl(passUrl)) {
    return { url: passUrl, label: "Train tickets", isExternal: !passUrl.startsWith("/") };
  }

  const manageUrl = reservation.manageUrl?.trim();
  if (manageUrl && isOpenableTicketUrl(manageUrl)) {
    return { url: manageUrl, label: "Train tickets", isExternal: true };
  }

  for (const link of reservation.sourceLinks ?? []) {
    if ((link.kind === "ticket" || link.kind === "manage") && isOpenableTicketUrl(link.url)) {
      return { url: link.url, label: "Train tickets", isExternal: !link.url.startsWith("/") };
    }
  }

  const quickLinks = buildReservationQuickLinks(reservation);
  const quickTicket = quickLinks.find((link) => link.kind === "ticket" || link.kind === "manage");
  if (quickTicket && isOpenableTicketUrl(quickTicket.url)) {
    return {
      url: quickTicket.url,
      label: "Train tickets",
      isExternal: !quickTicket.url.startsWith("/"),
    };
  }

  if (tripId && reservationHasSourceEmail(reservation)) {
    return {
      url: buildSourceEmailViewPath(tripId, reservation.id),
      label: reservation.hasPdfAttachment ? "Train tickets" : "Train tickets",
      isExternal: false,
    };
  }

  return null;
}

export function buildTrainTicketHandoffContent(
  reservation: TrainTicketSourceReservation,
  tripId?: string | null,
): TrainTicketHandoffContent | null {
  if (!isBookedTrainReservation(reservation)) return null;
  const target = resolveTrainTicketOpenTarget(reservation, tripId);
  if (!target) return null;

  const honestyNote = target.isExternal
    ? "Kepi opens your stored ticket or booking link — we do not generate rail barcodes."
    : reservation.hasPdfAttachment
      ? "Opens your forwarded confirmation email and PDF attachment."
      : "Opens your forwarded confirmation email.";

  return {
    reservationId: reservation.id,
    headline: trainHeadline(reservation),
    detail: trainDetail(reservation),
    primaryActionLabel: target.label,
    primaryActionUrl: target.url,
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
