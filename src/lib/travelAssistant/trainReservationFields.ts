/**
 * Resolve train number, platform, and seat for display — stored fields first,
 * then notes, then re-parse original ticket text when still blank.
 */

import {
  extractRailTicketFacts,
  extractRailPassengers,
  type RailTicketFacts,
} from "@/lib/travelAssistant/railTicketExtract";

export interface TrainReservationLike {
  type?: string;
  title?: string;
  provider?: string;
  location?: string;
  trainNumber?: string;
  trainPlatform?: string;
  trainSeat?: string;
  notes?: string;
  originalEmailText?: string;
  sourceEmailSubject?: string;
}

export interface ResolvedTrainFields {
  trainNumber: string;
  trainPlatform: string;
  trainSeat: string;
  fromStation: string;
  toStation: string;
  serviceLabel: string;
}

const PLATFORM_NOTE_RE = /\b(?:platform|binario|bin\.?|gleis)\s*[:#]?\s*(\d{1,2}[A-Z]?)\b/iu;
const SEAT_NOTE_RE =
  /\b(?:seat|posto|platz|pl\.?|sitz)\s*[:#]?\s*(\d{1,2}[A-Z]?)\b/iu;
const COACH_SEAT_NOTE_RE = /\b(?:coach|carrozza|wagen|wg\.?)\s*(\d+)\s*(?:[/,·]|posto|seat|platz|pl\.?|sitz)?\s*(\d{1,3}[A-Z]?)\b/iu;
const ROUTE_ARROW_RE =
  /^(.+?)\s*(?:→|->|—|–|→| to )\s*(.+)$/iu;

function pickFirstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) return trimmed;
  }
  return "";
}

function parseRouteFromLocation(location: string): { from: string; to: string } {
  const trimmed = location.trim();
  if (!trimmed) return { from: "", to: "" };
  const arrow = trimmed.match(ROUTE_ARROW_RE);
  if (arrow?.[1] && arrow[2]) {
    return { from: arrow[1].trim(), to: arrow[2].trim() };
  }
  const slash = trimmed.match(/^(.+?)\s*[/|]\s*(.+)$/u);
  if (slash?.[1] && slash[2]) {
    return { from: slash[1].trim(), to: slash[2].trim() };
  }
  return { from: "", to: "" };
}

function platformFromNotes(notes: string): string {
  const match = notes.match(PLATFORM_NOTE_RE);
  return match?.[1]?.trim() ?? "";
}

function seatFromNotes(notes: string): string {
  const coachSeat = notes.match(COACH_SEAT_NOTE_RE);
  if (coachSeat?.[1] && coachSeat[2]) {
    return `${coachSeat[1]}/${coachSeat[2]}`;
  }
  const seatOnly = notes.match(SEAT_NOTE_RE);
  return seatOnly?.[1]?.trim() ?? "";
}

function factsToFields(facts: RailTicketFacts): Partial<ResolvedTrainFields> {
  const route = parseRouteFromLocation(facts.location);
  return {
    trainNumber: facts.trainNumber?.trim() ?? "",
    trainPlatform: facts.trainPlatform?.trim() ?? platformFromNotes(facts.notes),
    trainSeat: facts.trainSeat?.trim() ?? seatFromNotes(facts.notes),
    fromStation: route.from,
    toStation: route.to,
    serviceLabel: facts.title?.trim() ?? "",
  };
}

function passengerSeatFromText(text: string): string {
  const passengers = extractRailPassengers(text);
  return passengers.find((row) => row.coachSeat.trim())?.coachSeat.trim() ?? "";
}

/** Merge stored reservation fields with notes + optional ticket re-parse. */
export function resolveTrainFields(reservation: TrainReservationLike): ResolvedTrainFields {
  const notes = reservation.notes?.trim() ?? "";
  let trainNumber = reservation.trainNumber?.trim() ?? "";
  let trainPlatform = reservation.trainPlatform?.trim() ?? platformFromNotes(notes);
  let trainSeat = reservation.trainSeat?.trim() ?? seatFromNotes(notes);
  let fromStation = "";
  let toStation = "";
  let serviceLabel = reservation.title?.trim() ?? "";

  const route = parseRouteFromLocation(reservation.location?.trim() ?? "");
  fromStation = route.from;
  toStation = route.to;

  const sourceText = [reservation.originalEmailText, reservation.sourceEmailSubject]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (sourceText && (!trainNumber || !trainPlatform || !trainSeat || !fromStation || !toStation)) {
    const facts = extractRailTicketFacts(sourceText, reservation.sourceEmailSubject ?? "");
    if (facts) {
      const parsed = factsToFields(facts);
      trainNumber = pickFirstNonEmpty(trainNumber, parsed.trainNumber);
      trainPlatform = pickFirstNonEmpty(trainPlatform, parsed.trainPlatform);
      trainSeat = pickFirstNonEmpty(trainSeat, parsed.trainSeat, passengerSeatFromText(sourceText));
      fromStation = pickFirstNonEmpty(fromStation, parsed.fromStation);
      toStation = pickFirstNonEmpty(toStation, parsed.toStation);
      serviceLabel = pickFirstNonEmpty(serviceLabel, parsed.serviceLabel);
    }
  }

  return {
    trainNumber,
    trainPlatform,
    trainSeat,
    fromStation,
    toStation,
    serviceLabel,
  };
}

/** Format platform/seat chips for timeline cards. */
export function formatTrainOperationalSummary(fields: ResolvedTrainFields): string {
  const bits: string[] = [];
  if (fields.trainNumber) bits.push(fields.trainNumber);
  if (fields.trainPlatform) bits.push(`Platform ${fields.trainPlatform}`);
  if (fields.trainSeat) bits.push(`Seat ${fields.trainSeat}`);
  return bits.join(" · ");
}
