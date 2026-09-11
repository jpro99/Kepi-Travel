/**
 * Verified boarding-pass facts from stored email/PDF text only — never invented.
 */

import { extractNamedPdfSection } from "@/lib/travelAssistant/emailSourceText";
import { legSlugFromRoute, type BoardingPassRoute } from "@/lib/travelAssistant/flightBoardingPassIngest";

export interface BoardingPassLegFacts {
  confirmationCode?: string;
  ticketNumber?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTime?: string;
  arrivalTime?: string;
  terminal?: string;
  boardingTime?: string;
  gateClosesTime?: string;
  seat?: string;
  boardingGroup?: string;
  gate?: string;
  baggageNote?: string;
}

const BOOKING_CODE_RE = /\bbooking\s+code\s*[:]\s*([A-Z0-9]{5,8})\b/iu;
const TICKET_NUMBER_RE = /\bticket\s+number\s*[:]\s*(\d{10,14})\b/iu;
const FLIGHT_LINE_RE =
  /\bflight\s*[:]\s*([A-Z]{2})\s*(\d{2,4})\s*[·•]\s*([A-Z]{3})\s*(?:→|->|—|–|-|to)\s*([A-Z]{3})\s*[·•]\s*\d{2}[A-Z]{3}\d{2}\s*[·•]\s*(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})\b/iu;
const TERMINAL_RE = /\bterminal\s+(\d+[A-Z]?)\b/iu;
const BOARDING_TIME_RE = /\bboarding\s+(\d{1,2}:\d{2})\b/iu;
const GATE_CLOSES_RE = /\bgate\s+closes\s+(\d{1,2}:\d{2})\b/iu;
const SEAT_RE = /\bseat\s+([A-Z]?\d{1,3}[A-Z]?)\b/iu;
const BOARDING_GROUP_RE = /\bboarding\s+group\s+(\d+)\b/iu;
const GATE_RE = /\bgate\s+(?!closes)(?:shown\s+as\s+)?([A-Z0-9]{2,4})\b/iu;
const BAGGAGE_RE = /\bbaggage\s*[:]\s*([^\n]+)/iu;

function titleCaseNamePart(part: string): string {
  return part
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const ITA_TITLE_SUFFIX_RE = /\s+(?:MRS|MR|MS|MISS)\.?$/iu;

/** LAST, FIRST MRS → First Last (display only; stored artifact keeps original). */
export function normalizeItaPassengerDisplayName(raw: string): string {
  const trimmed = raw.trim();
  const lastFirst = /^([A-Z][A-Z\s-]+),\s*(.+)$/iu.exec(trimmed);
  if (lastFirst?.[1] && lastFirst?.[2]) {
    const last = titleCaseNamePart(lastFirst[1]);
    const firstRaw = lastFirst[2].replace(ITA_TITLE_SUFFIX_RE, "").trim();
    const first = titleCaseNamePart(firstRaw);
    return `${first} ${last}`;
  }
  return trimmed.replace(/\s+/gu, " ");
}

export function extractBoardingPassLegFacts(text: string): BoardingPassLegFacts {
  const facts: BoardingPassLegFacts = {};
  const blob = text.trim();
  if (!blob) return facts;

  const booking = BOOKING_CODE_RE.exec(blob);
  if (booking?.[1]) facts.confirmationCode = booking[1].trim().toUpperCase();

  const ticket = TICKET_NUMBER_RE.exec(blob);
  if (ticket?.[1]) facts.ticketNumber = ticket[1].trim();

  const flight = FLIGHT_LINE_RE.exec(blob);
  if (flight) {
    facts.flightNumber = `${flight[1].toUpperCase()}${flight[2]}`;
    facts.departureAirport = flight[3].toUpperCase();
    facts.arrivalAirport = flight[4].toUpperCase();
    facts.departureTime = flight[5];
    facts.arrivalTime = flight[6];
  }

  const terminal = TERMINAL_RE.exec(blob);
  if (terminal?.[1]) facts.terminal = terminal[1].trim();

  const boarding = BOARDING_TIME_RE.exec(blob);
  if (boarding?.[1]) facts.boardingTime = boarding[1].trim();

  const gateCloses = GATE_CLOSES_RE.exec(blob);
  if (gateCloses?.[1]) facts.gateClosesTime = gateCloses[1].trim();

  const seat = SEAT_RE.exec(blob);
  if (seat?.[1]) facts.seat = seat[1].trim().toUpperCase();

  const group = BOARDING_GROUP_RE.exec(blob);
  if (group?.[1]) facts.boardingGroup = group[1].trim();

  const gate = GATE_RE.exec(blob);
  if (gate?.[1]) facts.gate = gate[1].trim().toUpperCase();

  const baggage = BAGGAGE_RE.exec(blob);
  if (baggage?.[1]) facts.baggageNote = baggage[1].trim();

  return facts;
}

export function mergeBoardingPassLegFacts(
  sections: string[],
): BoardingPassLegFacts {
  const merged: BoardingPassLegFacts = {};
  for (const section of sections) {
    const facts = extractBoardingPassLegFacts(section);
    for (const [key, value] of Object.entries(facts) as Array<[keyof BoardingPassLegFacts, string]>) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

/** Leg-level detail for Home — only fields present in stored artifacts. */
export function formatBoardingPassLegDetail(
  facts: BoardingPassLegFacts,
  fallbackConfirmation?: string,
): string {
  const bits: string[] = [];
  const conf = facts.confirmationCode ?? fallbackConfirmation?.trim();
  if (conf) bits.push(`Confirmation ${conf}`);
  if (facts.flightNumber) bits.push(facts.flightNumber);
  if (facts.departureAirport && facts.arrivalAirport) {
    bits.push(`${facts.departureAirport} → ${facts.arrivalAirport}`);
  }
  if (facts.departureTime && facts.arrivalTime) {
    bits.push(`${facts.departureTime}–${facts.arrivalTime}`);
  }
  if (facts.terminal) bits.push(`Terminal ${facts.terminal}`);
  if (facts.boardingTime) bits.push(`Boarding ${facts.boardingTime}`);
  if (facts.gate) bits.push(`Gate ${facts.gate}`);
  if (facts.gateClosesTime) bits.push(`Gate closes ${facts.gateClosesTime}`);
  if (bits.length === 0) return "Stored boarding pass in Kepi";
  return bits.join(" · ");
}

export function collectLegSectionTexts(
  sourceText: string | undefined,
  legSlug: string,
): string[] {
  if (!sourceText?.trim()) return [];
  const sections = sourceText.split(/(?=--- PDF: )/u).filter((part) => part.trim());
  const legNeedle = legSlug.replace(/-/gu, "").toLowerCase();
  return sections.filter((section) => {
    const header = section.match(/^--- PDF: (.+?) ---/mu)?.[1] ?? "";
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/gu, "");
    return normalized.includes(legNeedle);
  });
}

export function factsForStoredLeg(
  sourceText: string | undefined,
  route: BoardingPassRoute,
): BoardingPassLegFacts {
  const legSlug = legSlugFromRoute(route);
  const sections = collectLegSectionTexts(sourceText, legSlug);
  if (sections.length === 0 && sourceText?.trim()) {
    return extractBoardingPassLegFacts(sourceText);
  }
  return mergeBoardingPassLegFacts(sections);
}

export function extractPassengerSeatFromSection(sectionText: string): string | null {
  const seat = SEAT_RE.exec(sectionText);
  return seat?.[1]?.trim().toUpperCase() ?? null;
}

export function sectionTextForPassengerLeg(
  sourceText: string | undefined,
  passengerSlug: string,
  legSlug: string,
): string | null {
  if (!sourceText?.trim()) return null;
  const direct = extractNamedPdfSection(sourceText, passengerSlug, legSlug);
  return direct ?? null;
}
