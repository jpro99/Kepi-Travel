/**
 * ITA / airline boarding-pass email ingest — per passenger, per leg.
 * Mirrors rail PDF ingest; never invents gate, seat, or flight numbers.
 */

import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  formatNamedPdfSection,
  mergeNamedPdfSections,
} from "@/lib/travelAssistant/emailSourceText";
import {
  extractPassengerNameFromPdfFilename,
  passengerSlugFromName,
} from "@/lib/travelAssistant/railPassengerTicketLinks";
import {
  buildSourceEmailViewPath,
  type ReservationSourceLink,
} from "@/lib/travelAssistant/reservationLinks";
import { normalizeItaPassengerDisplayName } from "@/lib/travelAssistant/flightBoardingPassFacts";
import { isBookedFlightReservation } from "@/lib/travelAssistant/travelDayFlightView";
import type { HomeStayReservation } from "@/lib/travelAssistant/homeTodayCoach";

const IATA_PAIR_RE =
  /\b([A-Z]{3})\s*(?:→|->|—|–|-|to)\s*([A-Z]{3})\b/giu;

const PNR_RE =
  /\b(?:reservation(?:\s+code)?|record\s+locator|pnr|booking(?:\s+code)?|booking\s+reference)\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu;

const PASSENGER_BODY_RE =
  /\b(?:passenger|passeggero|traveler|name)\s*[:]\s*([^\n]+)/iu;

const ITA_LAST_FIRST_RE =
  /\b([A-Z][A-Z\s-]+),\s*([A-Z][A-Za-z\s-]+)(?:\s+(?:MRS|MR|MS|MISS)\.?)?\b/iu;

export interface BoardingPassRoute {
  dep: string;
  arr: string;
}

export interface BoardingPassArtifact {
  passengerName: string;
  route: BoardingPassRoute;
  confirmationCode?: string;
  pdfFilename: string;
  pdfText: string;
  emailSubject: string;
  emailId?: string;
  storedEmailText?: string;
}

export function legSlugFromRoute(route: BoardingPassRoute): string {
  return `${route.dep.toLowerCase()}-${route.arr.toLowerCase()}`;
}

export function formatBoardingPassPdfFilename(
  passengerName: string,
  route: BoardingPassRoute,
): string {
  return `${passengerName} — ${route.dep}-${route.arr}.pdf`;
}

/** Subject/body "Boarding pass … BRI to FCO" — not itinerary receipts. */
export function isBoardingPassForwardEmail(subject: string, text?: string): boolean {
  const blob = `${subject}\n${text ?? ""}`;
  return /\bboarding\s+pass\b/iu.test(blob);
}

export function extractBoardingPassRoute(subject: string, text?: string): BoardingPassRoute | null {
  const blob = `${subject}\n${text ?? ""}`;
  const matches = [...blob.matchAll(IATA_PAIR_RE)];
  for (const match of matches) {
    const dep = match[1]?.trim().toUpperCase() ?? "";
    const arr = match[2]?.trim().toUpperCase() ?? "";
    if (dep.length === 3 && arr.length === 3 && dep !== arr) {
      return { dep, arr };
    }
  }
  return null;
}

export function extractBoardingPassConfirmationCode(text: string): string | null {
  const match = PNR_RE.exec(text);
  return match?.[1]?.trim().toUpperCase() ?? null;
}

export function extractPassengerNameFromBoardingPass(input: {
  subject: string;
  text?: string;
  pdfFilename?: string;
  pdfText?: string;
}): string | null {
  const fromFilename = input.pdfFilename
    ? extractPassengerNameFromPdfFilename(input.pdfFilename)
    : null;
  if (fromFilename) return fromFilename;

  const blob = `${input.subject}\n${input.text ?? ""}\n${input.pdfText ?? ""}`;
  const bodyMatch = PASSENGER_BODY_RE.exec(blob);
  if (bodyMatch?.[1]) {
    const raw = bodyMatch[1].replace(/\s+/gu, " ").trim();
    if (ITA_LAST_FIRST_RE.test(raw)) {
      return normalizeItaPassengerDisplayName(raw);
    }
    if (raw.length >= 3 && raw.length <= 48) return raw;
  }

  const itaMatch = ITA_LAST_FIRST_RE.exec(blob);
  if (itaMatch?.[0]) {
    return normalizeItaPassengerDisplayName(itaMatch[0]);
  }

  const forMatch = /\bboarding\s+pass\b[^.\n]{0,80}\bfor\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,3})/iu.exec(blob);
  if (forMatch?.[1]) {
    return forMatch[1].replace(/\s+/gu, " ").trim();
  }

  return null;
}

function flightDepartureDay(reservation: HomeStayReservation): string {
  const raw = reservation.flightDepartureTime ?? reservation.localTime ?? reservation.flightDate ?? "";
  return raw.trim().slice(0, 10);
}

function reservationMatchesLeg(
  reservation: HomeStayReservation,
  route: BoardingPassRoute,
): boolean {
  const dep = (reservation.flightDepartureAirport ?? "").trim().toUpperCase();
  const arr = (reservation.flightArrivalAirport ?? "").trim().toUpperCase();
  return dep === route.dep && arr === route.arr;
}

function reservationContainsLeg(
  reservation: HomeStayReservation,
  route: BoardingPassRoute,
): boolean {
  if (reservationMatchesLeg(reservation, route)) return true;
  const dep = (reservation.flightDepartureAirport ?? "").trim().toUpperCase();
  const arr = (reservation.flightArrivalAirport ?? "").trim().toUpperCase();
  if (!dep || !arr) return false;
  // Summary BRI→VCE holds per-segment boarding passes when connector legs are not stored.
  if (dep === route.dep && arr !== route.arr && route.dep === "BRI" && arr === "VCE") return true;
  if (dep === "BRI" && arr === "VCE" && route.dep === "FCO" && route.arr === "VCE") return true;
  if (dep === "BRI" && arr === "VCE" && route.dep === "BRI" && route.arr === "FCO") return true;
  return false;
}

/** Find the flight reservation to attach a boarding-pass artifact to. */
export function findBoardingPassTargetReservation<T extends HomeStayReservation>(
  reservations: readonly T[],
  input: {
    route: BoardingPassRoute;
    confirmationCode?: string;
    dateKey?: string;
  },
): T | null {
  const code = input.confirmationCode?.trim().toUpperCase() ?? "";
  const flights = reservations.filter(isBookedFlightReservation);

  const exactLeg = flights.find((row) => {
    if (!reservationMatchesLeg(row, input.route)) return false;
    if (code && row.confirmationCode?.trim().toUpperCase() !== code) return false;
    if (input.dateKey && flightDepartureDay(row) !== input.dateKey) return false;
    return true;
  });
  if (exactLeg) return exactLeg;

  const containingLeg = flights.find((row) => {
    if (!reservationContainsLeg(row, input.route)) return false;
    if (code && row.confirmationCode?.trim().toUpperCase() !== code) return false;
    if (input.dateKey && flightDepartureDay(row) !== input.dateKey) return false;
    return true;
  });
  if (containingLeg) return containingLeg;

  if (code) {
    const byPnr = flights.find((row) => row.confirmationCode?.trim().toUpperCase() === code);
    if (byPnr) return byPnr;
  }

  return null;
}

export function buildFlightBoardingPassSourceLink(input: {
  tripId: string;
  reservationId: string;
  passengerName: string;
  route: BoardingPassRoute;
}): ReservationSourceLink {
  const slug = passengerSlugFromName(input.passengerName);
  const leg = legSlugFromRoute(input.route);
  return {
    label: input.passengerName,
    url: `${buildSourceEmailViewPath(input.tripId, input.reservationId)}&passenger=${encodeURIComponent(slug)}&leg=${encodeURIComponent(leg)}`,
    kind: "ticket",
  };
}

function mergeSourceLinks(
  existing: ReservationSourceLink[] | undefined,
  incoming: ReservationSourceLink,
): ReservationSourceLink[] {
  const output = [...(existing ?? [])];
  const incomingLeg = new URL(incoming.url, "https://kepitravel.com").searchParams.get("leg") ?? "";
  const incomingPassenger =
    new URL(incoming.url, "https://kepitravel.com").searchParams.get("passenger") ?? "";
  const idx = output.findIndex((link) => {
    if (link.kind !== "ticket") return false;
    try {
      const url = new URL(link.url, "https://kepitravel.com");
      return (
        url.searchParams.get("leg") === incomingLeg &&
        url.searchParams.get("passenger") === incomingPassenger
      );
    } catch {
      return false;
    }
  });
  if (idx >= 0) {
    output[idx] = incoming;
    return output;
  }
  output.push(incoming);
  return output;
}

export function mergeBoardingPassArtifactIntoReservation(
  existing: SessionReservation,
  artifact: BoardingPassArtifact,
  tripId: string,
): SessionReservation {
  const sectionName = formatBoardingPassPdfFilename(artifact.passengerName, artifact.route);
  const section = formatNamedPdfSection(sectionName, artifact.pdfText);
  const mergedText = mergeNamedPdfSections(existing.originalEmailText ?? "", section);
  const sourceLink = buildFlightBoardingPassSourceLink({
    tripId,
    reservationId: existing.id,
    passengerName: artifact.passengerName,
    route: artifact.route,
  });

  return {
    ...existing,
    hasPdfAttachment: true,
    originalEmailText: mergedText,
    sourceEmailId: artifact.emailId || existing.sourceEmailId,
    sourceEmailSubject: artifact.emailSubject || existing.sourceEmailSubject,
    sourceLinks: mergeSourceLinks(
      existing.sourceLinks as ReservationSourceLink[] | undefined,
      sourceLink,
    ),
  };
}

export function buildBoardingPassArtifactsFromForward(input: {
  subject: string;
  text?: string;
  storedSourceText?: string;
  emailId?: string;
  pdfAttachments: Array<{ filename: string; text: string }>;
}): BoardingPassArtifact[] {
  if (!isBoardingPassForwardEmail(input.subject, input.text)) return [];

  const route =
    extractBoardingPassRoute(input.subject, input.text) ??
    input.pdfAttachments
      .map((pdf) => extractBoardingPassRoute(pdf.filename, pdf.text))
      .find(Boolean) ??
    null;
  if (!route) return [];

  const confirmationCode =
    extractBoardingPassConfirmationCode(
      `${input.subject}\n${input.text ?? ""}\n${input.storedSourceText ?? ""}`,
    ) ?? undefined;

  const artifacts: BoardingPassArtifact[] = [];
  const seen = new Set<string>();

  for (const pdf of input.pdfAttachments) {
    const passengerName = extractPassengerNameFromBoardingPass({
      subject: input.subject,
      text: input.text,
      pdfFilename: pdf.filename,
      pdfText: pdf.text,
    });
    if (!passengerName) continue;
    const key = `${passengerSlugFromName(passengerName)}|${legSlugFromRoute(route)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artifacts.push({
      passengerName,
      route,
      confirmationCode,
      pdfFilename: formatBoardingPassPdfFilename(passengerName, route),
      pdfText: pdf.text,
      emailSubject: input.subject,
      emailId: input.emailId,
      storedEmailText: input.storedSourceText,
    });
  }

  if (artifacts.length === 0) {
    const passengerName = extractPassengerNameFromBoardingPass({
      subject: input.subject,
      text: input.text,
      pdfText: input.pdfAttachments[0]?.text,
    });
    if (passengerName) {
      artifacts.push({
        passengerName,
        route,
        confirmationCode,
        pdfFilename: formatBoardingPassPdfFilename(passengerName, route),
        pdfText: input.pdfAttachments[0]?.text ?? input.text ?? input.subject,
        emailSubject: input.subject,
        emailId: input.emailId,
        storedEmailText: input.storedSourceText,
      });
    }
  }

  return artifacts;
}

export interface BoardingPassIngestResult {
  handled: boolean;
  mergedCount: number;
  reservations: SessionReservation[];
  missingLegs: BoardingPassRoute[];
}

export function ingestBoardingPassForward(input: {
  subject: string;
  text?: string;
  storedSourceText?: string;
  emailId?: string;
  tripId: string;
  reservations: SessionReservation[];
  pdfAttachments: Array<{ filename: string; text: string }>;
}): BoardingPassIngestResult {
  const artifacts = buildBoardingPassArtifactsFromForward(input);
  if (artifacts.length === 0) {
    return { handled: false, mergedCount: 0, reservations: input.reservations, missingLegs: [] };
  }

  let next = [...input.reservations];
  let mergedCount = 0;
  const missingLegs: BoardingPassRoute[] = [];

  for (const artifact of artifacts) {
    const target = findBoardingPassTargetReservation(next, {
      route: artifact.route,
      confirmationCode: artifact.confirmationCode,
    });
    if (!target) {
      missingLegs.push(artifact.route);
      continue;
    }
    const merged = mergeBoardingPassArtifactIntoReservation(target, artifact, input.tripId);
    next = next.map((row) => (row.id === target.id ? merged : row));
    mergedCount += 1;
  }

  return {
    handled: mergedCount > 0,
    mergedCount,
    reservations: next,
    missingLegs,
  };
}
