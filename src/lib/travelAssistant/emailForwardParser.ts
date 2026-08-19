import Anthropic from "@anthropic-ai/sdk";
import { htmlToPlainConfirmationText } from "@/lib/travelAssistant/confirmationDocumentText";
import { mergePdfSectionIntoBody, sourceTextHasPricingSignal } from "@/lib/travelAssistant/emailSourceText";
import { extractHotelPropertyName } from "@/lib/travelAssistant/hotelPropertyName";
import {
  extractHotelAddressLocation,
  extractLabeledHotelStayDates,
} from "@/lib/travelAssistant/hotelStayDateExtract";
import { formatFewShotBlock } from "@/lib/travelAssistant/mlReadiness/fewShotExamples";
import { EMAIL_FORWARD_PARSER_VERSION } from "@/lib/travelAssistant/mlReadiness/parserVersion";
import type { FewShotParseExample } from "@/lib/travelAssistant/mlReadiness/types";
import { sanitizeTravelerNotes } from "@/lib/travelAssistant/sanitizeTravelerNotes";
import { extractRailTicketFacts } from "@/lib/travelAssistant/railTicketExtract";
import { extractActivityTicketFacts, stripLegalBoilerplate } from "@/lib/travelAssistant/activityTicketExtract";
import { logger } from "@/lib/logger";

export { extractHotelPropertyName };
export {
  extractHotelAddressLocation,
  extractLabeledHotelStayDates,
} from "@/lib/travelAssistant/hotelStayDateExtract";

const MODEL = "claude-sonnet-4-5";
const HIGH_CONFIDENCE_THRESHOLD = 70;
const LOW_CONFIDENCE_THRESHOLD = 40;
const MIN_READABLE_TEXT_LENGTH = 100;
const EMAIL_FORWARD_PARSER_SCOPE = "travelAssistant/emailForwardParser";

const FIELD_WEIGHTS = {
  type: 15,
  title: 15,
  provider: 10,
  confirmationCode: 20,
  localTime: 20,
  timezone: 8,
  location: 12,
  checkOutDate: 12,
  flightNumber: 0,
} as const;

const TIMEZONE_ABBREVIATION_MAP: Record<string, string> = {
  UTC: "Etc/UTC",
  GMT: "Etc/UTC",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
};
const IANA_TIMEZONE_REGION_PREFIXES = new Set([
  "Africa",
  "America",
  "Antarctica",
  "Arctic",
  "Asia",
  "Atlantic",
  "Australia",
  "Etc",
  "Europe",
  "Indian",
  "Pacific",
]);

function isValidIanaTimezone(candidate: string): boolean {
  const normalized = candidate.trim();
  if (!normalized) {
    return false;
  }
  const region = normalized.split("/")[0] ?? "";
  if (!IANA_TIMEZONE_REGION_PREFIXES.has(region)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return true;
  } catch {
    return false;
  }
}

function sanitizeTimezoneValue(raw: string): string {
  const normalized = raw.trim();
  if (!normalized) {
    return "Etc/UTC";
  }
  const uppercase = normalized.toUpperCase();
  if (TIMEZONE_ABBREVIATION_MAP[uppercase]) {
    return TIMEZONE_ABBREVIATION_MAP[uppercase] ?? "Etc/UTC";
  }
  if (isValidIanaTimezone(normalized)) {
    return normalized;
  }
  return "Etc/UTC";
}

const COUNTRY_CODE_DENYLIST = new Set([
  "AF", "AL", "AO", "AR", "AM", "AU", "AT", "AZ", "BE", "BZ",
  "BR", "BG", "CA", "CL", "CN", "CO", "HR", "CU", "CY", "CZ",
  "DK", "EG", "EE", "ET", "FI", "FR", "GE", "DE", "GH", "GR",
  "GT", "HU", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JP",
  "JO", "KZ", "KE", "KW", "LV", "LB", "LY", "LI", "LT", "LU",
  "MY", "MV", "ML", "MT", "MX", "MD", "MC", "MN", "ME", "MA",
  "MM", "NA", "NP", "NL", "NZ", "NG", "MK", "NO", "OM", "PK",
  "PA", "PY", "PE", "PH", "PL", "PT", "QA", "RO", "RU", "SA",
  "SN", "RS", "SG", "SK", "SI", "SO", "ZA", "ES", "LK", "SE",
  "CH", "SY", "TW", "TZ", "TH", "TT", "TN", "TR", "UA", "AE",
  "GB", "UK", "US", "UY", "VE", "VN", "YE", "ZM", "ZW",
  // Credit card prefixes — never flight numbers
  "VI", "MC", "AX", "DI", "DC",
]);

const AIRPORT_WORD_DENYLIST = new Set([
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "WAS", "ONE", "OUR", "OUT", "GET", "HAS", "HOW",
  "NEW", "NOW", "OLD", "SEE", "TWO", "WAY", "WHO", "ITS", "LET", "PUT", "SAY", "SHE", "TOO", "USE", "MAY", "END",
  "FAR", "FEW", "GOT", "HAD", "HIM", "LOW", "OWN", "PAY", "SIT", "SIX", "TEN", "TRY", "YET", "SUN", "MON", "TUE",
  "WED", "THU", "FRI", "SAT", "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "PDF",
  "ETA", "ETD", "UTC", "GMT", "EST", "CST", "MST", "PST",
]);

const FLIGHT_CONTEXT_RE = /\b(flight|airline|boarding\s*pass|aircraft|operated\s*by|itinerary|segment|departure|arrival|connecting|connection|layover|outbound|inbound|return(?:ing)?|round[\s-]?trip)\b/iu;

const FLIGHT_NUMBER_RE = /\b(?:Flight\s*)?([A-Z]{2})\s*(\d{1,4})\b/gu;

const NEXT_FLIGHT_TOKEN_RE = /\b(?:Flight\s*)?[A-Z]{2}\s*\d{1,4}\b/u;

/** False positives like "Flight 1 of 5" → OF5. */
const FALSE_FLIGHT_PREFIX_DENYLIST = new Set(["OF", "AT", "AM", "PM", "TO", "ON", "IN", "BY", "OR", "IF", "AN"]);

/** Airline IATA codes that collide with ISO country codes — allow in flight context. */
const AIRLINE_COUNTRY_OVERRIDES = new Set([
  "AF", "AI", "AM", "AR", "AZ", "CA", "ET", "GA", "IB", "KE", "LA", "LO", "LY", "ME", "MU", "NZ", "OK", "OS", "RO",
  "SA", "SK", "SN", "SQ", "SU", "SV", "TG", "TK", "UX", "VN",
]);

function isDeniedFlightAirlineCode(code: string, context: string): boolean {
  const upper = code.toUpperCase();
  if (FALSE_FLIGHT_PREFIX_DENYLIST.has(upper)) {
    return true;
  }
  if (!COUNTRY_CODE_DENYLIST.has(upper)) {
    return false;
  }
  if (!AIRLINE_COUNTRY_OVERRIDES.has(upper)) {
    return true;
  }
  return !(
    FLIGHT_CONTEXT_RE.test(context) ||
    /\([A-Z]{3}\)/u.test(context) ||
    /\boperated\s+by\b/iu.test(context)
  );
}

const RESERVATION_TYPE_KEYWORDS: Array<{ type: ForwardedReservationType; pattern: RegExp; confidence: number }> = [
  {
    type: "flight",
    pattern: /\b(flight\s*(?:number|#|coupon)?|airlines?|airways|boarding\s*pass|departure\s*airport|arrival\s*airport)\b/iu,
    confidence: 0.78,
  },
  { type: "hotel", pattern: /\b(hotel|check-?in|check out|room|suite|stay)\b/iu, confidence: 0.78 },
  { type: "train", pattern: /\b(train|rail|amtrak|station|platform|trenitalia|italo|partenza|binario|stazione)\b/iu, confidence: 0.75 },
  {
    type: "dinner",
    pattern:
      /\b(dinner reservation|restaurant reservation|table for\s*\d+|party of\s*\d+|reservation for\s*\d+|excursion|guided tour|walking tour|boat (?:ride|tour|excursion)|getyourguide|viator|airbnb experience|snorkel(?:ing)?|scuba|day trip|cooking class|wine tasting|ticket confirmation)\b/iu,
    confidence: 0.68,
  },
  { type: "ride", pattern: /\b(car rental|uber|lyft|taxi|ride|pickup|dropoff)\b/iu, confidence: 0.72 },
];

const REQUIRED_FIELDS: ForwardedReservationField[] = [
  "type",
  "title",
  "provider",
  "confirmationCode",
  "localTime",
  "location",
];

type ParserSource = "regex" | "ai";
type CandidateMap = Partial<Record<ForwardedReservationField, FieldCandidate>>;

interface FieldCandidate {
  value: string;
  confidence: number;
  source: ParserSource;
}

export type ForwardedReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
export type ForwardedReservationField =
  | "type"
  | "title"
  | "provider"
  | "confirmationCode"
  | "localTime"
  | "timezone"
  | "location"
  | "notes"
  | "flightNumber"
  | "departureAirport"
  | "arrivalAirport"
  | "checkOutDate";
export type ForwardedParsingStatus = "auto-parsed" | "needs-review" | "needs-user-input";
export type ForwardedConfidenceLevel = "high" | "medium" | "low";

export interface ForwardedEmailAttachmentMeta {
  filename?: string | null;
  contentType?: string | null;
}

export interface ForwardedEmailParseInput {
  subject?: string | null;
  from?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: ForwardedEmailAttachmentMeta[] | null;
  fewShotExamples?: FewShotParseExample[];
}

export interface ForwardedReservationDraft {
  type: ForwardedReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  notes: string;
  flightNumber?: string;
  checkOutDate?: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

export interface ForwardedEmailParseResult {
  draft: ForwardedReservationDraft;
  drafts: ForwardedReservationDraft[];
  confidenceScore: number;
  confidenceLevel: ForwardedConfidenceLevel;
  parsingStatus: ForwardedParsingStatus;
  missingFields: ForwardedReservationField[];
  parserNotes: string[];
  originalEmailText: string;
  imageBasedEmail: boolean;
  hasPdfAttachment: boolean;
  usedAiFallback: boolean;
  parserVersion: string;
}

export { EMAIL_FORWARD_PARSER_VERSION };

function extractOriginalEmailFromForwardChain(text: string): string {
  // When an email is forwarded multiple times, Gmail adds repeated
  // "---------- Forwarded message ---------" headers. Prefer the deepest
  // block — but keep the full thread when only an earlier block has the fare.
  const forwardMarker = "---------- Forwarded message ---------";
  const lastMarkerIdx = text.lastIndexOf(forwardMarker);
  if (lastMarkerIdx >= 0) {
    const lastBlock = text.slice(lastMarkerIdx);
    if (sourceTextHasPricingSignal(lastBlock) || !sourceTextHasPricingSignal(text)) {
      return lastBlock;
    }
    return text;
  }
  // Also handle "-----Original Message-----" style
  const originalMarker = "-----Original Message-----";
  const lastOriginalIdx = text.lastIndexOf(originalMarker);
  if (lastOriginalIdx >= 0) {
    const lastBlock = text.slice(lastOriginalIdx);
    if (sourceTextHasPricingSignal(lastBlock) || !sourceTextHasPricingSignal(text)) {
      return lastBlock;
    }
    return text;
  }
  return text;
}

const NON_TRAVEL_DATE_CONTEXT =
  /\b(?:purchase(?:d)?|booked on|booking date|transaction date|order date|payment date|payment scheduled|scheduled payment|payout|balance due|you will be charged|total charged|charged a total|issued on|date of issue|receipt date|ticketed on|sales date|invoice date|email sent|sent on|forwarded message|free cancellation|cancellation policy|e-?t-?a\b|esta\b|visa[- ]exempt|visa waiver|electronic system for travel authorization|hazardous materials|conditions of carriage|privacy policy|data protection|effective\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu;

const TRAVEL_DATE_CONTEXT =
  /\b(?:depart(?:ure|s|ing)?|arriv(?:al|es|ing)?|scheduled|flight|gate|terminal|boarding|check-?in|check out|leaves| lands|segment|itinerary|train|rail|partenza|arrivo|binario|platform|stazione|trenitalia|italo)\b/iu;

/** English words / labels that must never be treated as PNR / confirmation codes. */
const CONFIRMATION_CODE_WORD_DENYLIST = new Set([
  "RECEIPT",
  "CODE",
  "NUMBER",
  "DETAILS",
  "PENDING",
  "CONFIRMED",
  "RESERVED",
  "BOOKING",
  "TRAVEL",
  "FLIGHT",
  "HOTEL",
  "TICKET",
  "MANAGE",
  "VIEW",
  "FORWARDED",
  "MESSAGE",
  "YOUR",
  "TRIP",
  "TRIPS",
  "ITINERARY",
  "ALASKA",
  "UNITED",
  "DELTA",
  "AMERICAN",
  "HAWAIIAN",
  "OUTBOUND",
  "INBOUND",
  "RETURN",
  "CONFIRMATION",
  "CAREFULLY",
  "PLEASE",
  "REVIEW",
  "IMPORTANT",
  "HELPFUL",
  "INFORMATION",
  "CUSTOMER",
  "SERVICES",
  "CHOOSING",
  "THANK",
  "ABOUT",
  "THESE",
  "THERE",
  "THEIR",
  "WHICH",
  "WHERE",
  "WHILE",
  "BEFORE",
  "AFTER",
  "UNDER",
  "ABOVE",
  "ITALY",
  "ROME",
  "AIRWAYS",
  "ELECTRONIC",
  "DOCUMENT",
  "DOCUMENTS",
  "PASSENGER",
  "PASSENGERS",
  "REFERENCE",
  "ERENCE",
  "INSTRUCTIONS",
  "NOTICE",
  "PRIVACY",
  "POLICY",
  "LEGAL",
  "TERMS",
  "CONDITIONS",
  "GENERAL",
]);

const AIRLINE_PROVIDER_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /\bITA\s*Airways\b/iu, provider: "ITA Airways" },
  { pattern: /\bAlaska\s*Airlines\b/iu, provider: "Alaska Airlines" },
  { pattern: /\bHawaiian\s*Airlines\b/iu, provider: "Hawaiian Airlines" },
  { pattern: /\bAmerican\s*Airlines\b/iu, provider: "American Airlines" },
  { pattern: /\bUnited\s*Airlines\b/iu, provider: "United Airlines" },
  { pattern: /\bDelta\s*Air\s*Lines\b/iu, provider: "Delta Air Lines" },
  { pattern: /\bAir\s*France\b/iu, provider: "Air France" },
  { pattern: /\bBritish\s*Airways\b/iu, provider: "British Airways" },
  { pattern: /\bLufthansa\b/iu, provider: "Lufthansa" },
  { pattern: /\bSouthwest\s*Airlines\b/iu, provider: "Southwest Airlines" },
  { pattern: /\bJetBlue\b/iu, provider: "JetBlue" },
];

const EMAIL_HEADER_METADATA_LINE =
  /^(?:From|To|Cc|Bcc|Reply-To|Subject|Sent|Date|De|Para|Objet|Fecha):\s*/iu;

const EMAIL_HEADER_DATE_LINE =
  /^(?:Date|Sent):\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]*(?:\([+-]?\d{4}\)|\b(?:UTC|GMT|[A-Z]{2,5})\b)/iu;

/** Strip Gmail/Outlook forward wrappers so purchase/forward dates are not parsed as trip dates. */
export function stripForwardEnvelopeHeaders(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^---------- Forwarded message ---------$/iu.test(trimmed)) return false;
      if (/^-----Original Message-----$/iu.test(trimmed)) return false;
      if (EMAIL_HEADER_METADATA_LINE.test(trimmed)) return false;
      if (EMAIL_HEADER_DATE_LINE.test(trimmed)) return false;
      if (/^On .+ wrote:$/iu.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

export function prepareEmailBodyForParsing(rawText: string): { collapsed: string; lineAware: string } {
  let lineAware = rawText.replace(/\r\n/g, "\n");
  lineAware = extractOriginalEmailFromForwardChain(lineAware);
  lineAware = stripForwardEnvelopeHeaders(lineAware);
  lineAware = stripLegalBoilerplate(lineAware);
  return {
    lineAware,
    collapsed: normalizeWhitespace(lineAware),
  };
}

function lineMentionsIsoDay(line: string, isoDay: string): boolean {
  if (line.includes(isoDay) || line.includes(isoDay.replace(/-/gu, "/"))) {
    return true;
  }
  const datePatterns = [
    /\b(20\d{2}-\d{2}-\d{2})\b/u,
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u,
    /\b(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})\b/iu,
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/iu,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu,
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu,
  ];
  for (const pattern of datePatterns) {
    const match = line.match(pattern);
    const rawDate = match?.[1]?.replace(/\s+at\s+.*/iu, "") ?? "";
    if (rawDate && parseDateCandidate(rawDate) === isoDay) {
      return true;
    }
  }
  return false;
}

function isImplausibleTravelDate(isoLocalTime: string): boolean {
  const day = isoLocalTime.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return false;
  const year = Number(day.slice(0, 4));
  const nowYear = new Date().getUTCFullYear();
  // Legal footnotes (e.g. eTA Effective March 15, 2016) must never become flight dates.
  if (year < nowYear - 1) return true;
  const ms = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(ms)) return false;
  // More than ~18 months in the past without a nearby flight number is not a live itinerary.
  return ms < Date.now() - 548 * 86_400_000;
}

function localTimeIsTravelContext(localTime: string, lineAwareText: string): boolean {
  const day = localTime.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return true;
  if (isImplausibleTravelDate(localTime)) return false;
  const lines = lineAwareText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const contextLines = [lines[index - 1], lines[index], lines[index + 1]].filter(Boolean);
    const mentionsDay = contextLines.some((line) => lineMentionsIsoDay(line, day));
    if (!mentionsDay) continue;
    const context = contextLines.join(" ");
    // Legal/visa boilerplate wins even when the same paragraph mentions "boarding".
    if (NON_TRAVEL_DATE_CONTEXT.test(context)) return false;
    if (TRAVEL_DATE_CONTEXT.test(context)) return true;
  }
  return !lines.some((line) => lineMentionsIsoDay(line, day) && NON_TRAVEL_DATE_CONTEXT.test(line));
}

function sanitizeTravelLocalTime(candidates: CandidateMap, lineAwareText: string): CandidateMap {
  const localTime = candidates.localTime;
  if (!localTime?.value.trim()) return candidates;
  const hasFlightNumber = Boolean(candidates.flightNumber?.value?.trim());
  if (isImplausibleTravelDate(localTime.value) && !hasFlightNumber) {
    const next = { ...candidates };
    delete next.localTime;
    return next;
  }
  if (localTime.source === "regex" && hasFlightNumber) {
    return candidates;
  }
  if (localTimeIsTravelContext(localTime.value, lineAwareText)) return candidates;
  const next = { ...candidates };
  delete next.localTime;
  return next;
}

function isAllowedConfirmationCode(raw: string): boolean {
  const code = normalizeConfirmationCode(raw);
  if (code.length < 5 || code.length > 12) return false;
  if (CONFIRMATION_CODE_WORD_DENYLIST.has(code)) return false;
  // Ticket numbers like 055-4208939987 are not PNRs.
  if (/^\d{3}-\d+$/u.test(raw.trim()) || /^\d{10,}$/u.test(code)) return false;
  return true;
}

/**
 * Prefer explicit "Reservation code Z84T4Z" / "Confirmation ABC123" labels.
 * Never grab the next English word after bare "confirmation" (e.g. "carefully").
 */
export function extractConfirmationCodeFromText(text: string): string | null {
  const combined = text.trim();
  if (!combined) return null;

  const labeledPatterns = [
    /\bviator\s+booking\s+(\d{6,14})\b/iu,
    /\bbooking\s+([A-Z0-9]{10,16})\b/iu,
    /\bcodice\s+prenotazione\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\bcodice\s+biglietto\s*[:#]?\s*([A-Z0-9]{6,12})\b/iu,
    /\breservation\s+code\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\b(?:confirmation|record\s*locator|pnr)\s*(?:number|code|#)\s*[:#]?\s*([A-Z0-9]{5,8})\b/iu,
    /\b(?:confirmation|record\s*locator|pnr)\s+#\s*([A-Z0-9]{5,8})\b/iu,
    /\bbooking\s+(?:reference|ref|code|number)\b\s*[:#]?\s*([A-Z0-9]{5,12})\b/iu,
    // "Confirmation ABC123" / "Confirmation: LDM-2291" — never "confirmation carefully"
    /\bconfirmation\s*[:#]?\s*([A-Z0-9-]{5,12})\b/iu,
  ];
  for (let index = 0; index < labeledPatterns.length; index += 1) {
    const pattern = labeledPatterns[index];
    const match = combined.match(pattern);
    const code = match?.[1] ?? "";
    if (!code) continue;
    // Viator uses numeric-only booking IDs (6–14 digits) — not airline PNRs.
    if (index === 0 && /^\d{6,14}$/u.test(code)) {
      return code;
    }
    if (isAllowedConfirmationCode(code)) {
      return normalizeConfirmationCode(code);
    }
  }
  return null;
}

function extractAirlineProvider(subject: string, text: string): string | null {
  const combined = `${subject}\n${text}`;
  for (const entry of AIRLINE_PROVIDER_PATTERNS) {
    if (entry.pattern.test(combined)) return entry.provider;
  }
  return null;
}

function findTimeOnNearbyLines(lines: string[], index: number): string | null {
  const candidates = [lines[index], lines[index - 1], lines[index + 1], lines[index + 2]]
    .filter(Boolean)
    .join(" ");
  const combinedMatch =
    candidates.match(/\bat\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu) ??
    candidates.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu) ??
    candidates.match(/\bat\s+(\d{1,2}:\d{2})\b/iu) ??
    candidates.match(/\b(\d{1,2}:\d{2})\b/u);
  return parseTimeTo24Hour(combinedMatch?.[1] ?? "");
}

function extractBestLocalTimeCandidate(
  lineAwareText: string,
  reservationType: ForwardedReservationType | undefined,
): { localTime: string; confidence: number } | null {
  const lines = lineAwareText.split("\n");
  const scored: Array<{ localTime: string; score: number }> = [];
  const datePatterns = [
    /\b(20\d{2}-\d{2}-\d{2})\b/u,
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u,
    /\b(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})\b/iu,
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/iu,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu,
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/iu,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/iu,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const context = [lines[index - 2], lines[index - 1], line, lines[index + 1], lines[index + 2]]
      .filter(Boolean)
      .join(" ");
    if (EMAIL_HEADER_DATE_LINE.test(line.trim())) continue;
    // Visa/eTA/legal footnotes often mention "boarding" — still not a flight date.
    if (NON_TRAVEL_DATE_CONTEXT.test(context)) continue;

    const combinedDateTime = line.match(
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu,
    );
    if (combinedDateTime?.[1] && combinedDateTime[2]) {
      const parsedDate = parseDateCandidate(combinedDateTime[1]);
      const parsedTime = parseTimeTo24Hour(combinedDateTime[2]);
      if (parsedDate && parsedTime) {
        let score = 6;
        if (TRAVEL_DATE_CONTEXT.test(context)) score += 5;
        if (/\b(?:depart|departure|leaves|scheduled)\b/iu.test(context)) score += 3;
        if (/\b(?:arrival|arrive|arriving|lands|landed)\b/iu.test(context)) score -= 4;
        scored.push({ localTime: `${parsedDate} ${parsedTime}`, score });
        continue;
      }
    }

    for (const pattern of datePatterns) {
      const dateMatch = line.match(pattern) ?? context.match(pattern);
      const rawDate = dateMatch?.[1] ?? "";
      const parsedDate = parseDateCandidate(rawDate.replace(/\s+at\s+.*/iu, ""));
      if (!parsedDate) continue;

      let score = 0;
      if (TRAVEL_DATE_CONTEXT.test(context)) score += 5;
      // Bare "scheduled" boosts flights; hotels must not prefer payment-scheduled dates (I39).
      if (reservationType === "hotel") {
        if (/\b(?:depart|departure|leaves)\b/iu.test(context)) score += 3;
      } else if (/\b(?:depart|departure|leaves|scheduled)\b/iu.test(context)) {
        score += 3;
      }
      if (/^Departure\b/iu.test(line) || /^Departure\b/iu.test(lines[index - 1] ?? "")) score += 5;
      if (/\b(?:arrival|arrive|arriving|lands|landed)\b/iu.test(context)) score -= 4;
      if (reservationType === "hotel" && /\b(?:check-?in|check out|stay|night)\b/iu.test(context)) score += 4;
      if (NON_TRAVEL_DATE_CONTEXT.test(context)) score -= 8;

      const parsedTime = findTimeOnNearbyLines(lines, index);
      const localTime = parsedTime ? `${parsedDate} ${parsedTime}` : `${parsedDate} 12:00`;
      if (parsedTime) score += 3;
      scored.push({ localTime, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDefault = a.localTime.endsWith(" 12:00") ? 1 : 0;
    const bDefault = b.localTime.endsWith(" 12:00") ? 1 : 0;
    return aDefault - bDefault;
  });
  const best = scored.find((entry) => !isImplausibleTravelDate(entry.localTime) && entry.score >= 1);
  if (!best) return null;
  return {
    localTime: best.localTime,
    confidence: Math.min(0.82, 0.42 + best.score * 0.07),
  };
}

function extractLegDepartureTime(window: string): { localTime: string; confidence: number } | null {
  const lines = window.split("\n");
  let collecting = false;
  const depLines: string[] = [];
  for (const line of lines) {
    if (/\b(?:Departure|Depart(?:s|ure)?|From)\b/iu.test(line)) {
      collecting = true;
      depLines.push(line);
      continue;
    }
    if (collecting) {
      const trimmedLine = line.trim();
      if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/iu.test(trimmedLine)) {
        depLines.push(line);
        continue;
      }
      if (/^\s*(?:Flight\s*)?[A-Z]{2}\s*\d{1,4}\b/u.test(trimmedLine)) break;
      if (/\b(?:Arrival|Arrive(?:s)?)\b/iu.test(line)) break;
      depLines.push(line);
    }
  }
  if (depLines.length > 0) {
    const depBlock = depLines.join("\n");
    const inlineDateTimeMatch = depBlock.match(
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu,
    );
    if (inlineDateTimeMatch?.[1] && inlineDateTimeMatch[2]) {
      const parsedDate = parseDateCandidate(inlineDateTimeMatch[1]);
      const parsedTime = parseTimeTo24Hour(inlineDateTimeMatch[2]);
      if (parsedDate && parsedTime) {
        return { localTime: `${parsedDate} ${parsedTime}`, confidence: 0.82 };
      }
    }
    const fromDeparture = extractBestLocalTimeCandidate(depBlock, "flight");
    if (fromDeparture) return fromDeparture;
  }
  return extractBestLocalTimeCandidate(window, "flight");
}

/** Resolve the best travel date/time from a raw or forwarded email body. */
export function extractBestLocalTimeFromEmailBody(
  rawText: string,
  reservationType?: ForwardedReservationType,
): string | null {
  const prepared = prepareEmailBodyForParsing(rawText);
  return extractBestLocalTimeCandidate(prepared.lineAware, reservationType)?.localTime ?? null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function htmlToLineAwareText(html: string): string {
  return htmlToPlainConfirmationText(html);
}

function hasPdfAttachment(attachments: ForwardedEmailAttachmentMeta[] | null | undefined): boolean {
  if (!attachments || attachments.length === 0) {
    return false;
  }
  return attachments.some((attachment) => {
    const filename = attachment.filename?.toLowerCase() ?? "";
    const contentType = attachment.contentType?.toLowerCase() ?? "";
    return filename.endsWith(".pdf") || contentType.includes("pdf");
  });
}

function normalizeType(rawType: string): ForwardedReservationType | null {
  const value = rawType.trim().toLowerCase();
  if (value === "flight" || value === "hotel" || value === "train") {
    return value;
  }
  if (value === "ride" || value === "car" || value === "rental") {
    return "ride";
  }
  if (
    value === "dinner" ||
    value === "restaurant" ||
    value === "activity" ||
    value === "excursion" ||
    value === "tour"
  ) {
    return "dinner";
  }
  return null;
}

function formatProviderFromSender(sender: string): string {
  const domainMatch = sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/iu);
  const domain = domainMatch?.[1]?.toLowerCase() ?? "";
  if (!domain) {
    return "";
  }
  if (domain.includes("booking.com")) return "Booking.com";
  if (domain.includes("expedia.")) return "Expedia";
  if (domain.includes("hotels.com")) return "Hotels.com";
  if (domain.includes("airbnb.")) return "Airbnb";
  if (domain.includes("vrbo.")) return "Vrbo";
  if (domain.includes("agoda.")) return "Agoda";
  const host = domain.split(".")[0] ?? "";
  if (!host) {
    return "";
  }
  return host
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

const OTA_TITLE_DENYLIST = /^(booking\.com|booking|expedia|hotels\.com|airbnb|vrbo|agoda|trip\.com|priceline|kayak)$/iu;

function normalizeConfirmationCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/gu, "");
}

function parseTimeTo24Hour(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const twelveHourMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/u.exec(trimmed);
  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2]);
    const meridiem = twelveHourMatch[3];
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    if (meridiem === "PM" && hour < 12) {
      hour += 12;
    }
    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFourHourMatch = /^(\d{1,2}):(\d{2})$/u.exec(trimmed);
  if (!twentyFourHourMatch) {
    return null;
  }
  const hour = Number(twentyFourHourMatch[1]);
  const minute = Number(twentyFourHourMatch[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDateCandidate(raw: string): string | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  if (isoMatch) {
    const parsed = Date.parse(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u.exec(input);
  if (usMatch) {
    let month = Number(usMatch[1]);
    let day = Number(usMatch[2]);
    const year = Number(usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3]);
    if (month > 12 && day <= 12) {
      const swap = month;
      month = day;
      day = swap;
    }
    const parsed = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const parsedDate = new Date(parsed);
  return [
    parsedDate.getUTCFullYear(),
    String(parsedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(parsedDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function resolveTimezone(text: string): string {
  const abbrMatch = text.match(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/u);
  if (abbrMatch) {
    return sanitizeTimezoneValue(abbrMatch[1]);
  }

  const ianaMatches = [...text.matchAll(/\b([A-Za-z_]+(?:\/[A-Za-z_+-]+)+)\b/gu)];
  for (const match of ianaMatches) {
    const candidate = match[1]?.trim();
    if (candidate && isValidIanaTimezone(candidate)) {
      return candidate;
    }
  }
  return "Etc/UTC";
}

function parseAiCandidate(candidate: Record<string, unknown>): CandidateMap {
  const output: CandidateMap = {};
  const setIfPresent = (field: ForwardedReservationField, value: unknown, confidence = 0.78): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = normalizeWhitespace(value);
    if (!trimmed) {
      return;
    }
    output[field] = {
      value: trimmed,
      confidence,
      source: "ai",
    };
  };

  if (typeof candidate.type === "string") {
    const normalized = normalizeType(candidate.type);
    if (normalized) {
      output.type = {
        value: normalized,
        confidence: 0.82,
        source: "ai",
      };
    }
  }
  setIfPresent("title", candidate.title, 0.9);
  setIfPresent("provider", candidate.provider, 0.76);
  setIfPresent("confirmationCode", candidate.confirmationCode, 0.8);
  setIfPresent("localTime", candidate.localTime, 0.74);
  if (typeof candidate.timezone === "string") {
    const sanitizedTimezone = sanitizeTimezoneValue(candidate.timezone);
    output.timezone = {
      value: sanitizedTimezone,
      confidence: sanitizedTimezone === "Etc/UTC" ? 0.5 : 0.72,
      source: "ai",
    };
  }
  setIfPresent("location", candidate.location, 0.76);
  setIfPresent("notes", candidate.notes, 0.68);
  setIfPresent("flightNumber", candidate.flightNumber, 0.9);
  setIfPresent("departureAirport", candidate.departureAirport, 0.9);
  setIfPresent("arrivalAirport", candidate.arrivalAirport, 0.9);
  setIfPresent("checkOutDate", candidate.checkOutDate, 0.85);
  return output;
}

function hasExtractableCandidateData(candidate: CandidateMap): boolean {
  return Object.values(candidate).some((value) => Boolean(value?.value?.trim()));
}

function parseAiResponse(text: string): CandidateMap[] {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const jsonStart =
    objectStart < 0
      ? arrayStart
      : arrayStart < 0
        ? objectStart
        : Math.min(objectStart, arrayStart);
  const jsonEnd = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return [];
  }

  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) => (entry && typeof entry === "object" ? parseAiCandidate(entry as Record<string, unknown>) : {}))
      .filter(hasExtractableCandidateData);
  }
  if (typeof parsed !== "object") {
    return [];
  }

  const payload = parsed as Record<string, unknown>;
  const reservationsPayload = Array.isArray(payload.reservations) ? payload.reservations : [];
  const reservationCandidates = reservationsPayload
    .map((entry) => (entry && typeof entry === "object" ? parseAiCandidate(entry as Record<string, unknown>) : {}))
    .filter(hasExtractableCandidateData);
  if (reservationCandidates.length > 0) {
    return reservationCandidates;
  }

  const singleCandidate = parseAiCandidate(payload);
  return hasExtractableCandidateData(singleCandidate) ? [singleCandidate] : [];
}

function applySharedFields(candidate: CandidateMap, shared: CandidateMap): CandidateMap {
  const merged: CandidateMap = { ...candidate };
  if (!merged.confirmationCode?.value?.trim() && shared.confirmationCode?.value?.trim()) {
    merged.confirmationCode = shared.confirmationCode;
  }
  if (!merged.provider?.value?.trim() && shared.provider?.value?.trim()) {
    merged.provider = shared.provider;
  }
  return merged;
}

function mergeCandidates(base: CandidateMap, incoming: CandidateMap): CandidateMap {
  const merged: CandidateMap = { ...base };
  const keys = Object.keys(incoming) as ForwardedReservationField[];
  for (const key of keys) {
    const next = incoming[key];
    if (!next || !next.value.trim()) {
      continue;
    }
    const existing = merged[key];
    if (!existing || next.confidence > existing.confidence) {
      merged[key] = next;
    }
  }
  const reservationType = normalizeType(incoming.type?.value ?? base.type?.value ?? "");
  const hasFlightSignals = reservationType === "flight" || Boolean(incoming.flightNumber?.value || base.flightNumber?.value);
  if (
    hasFlightSignals &&
    incoming.localTime?.source === "ai" &&
    incoming.localTime.value.trim()
  ) {
    merged.localTime = incoming.localTime;
  }
  return merged;
}

function scoreCandidates(candidates: CandidateMap): number {
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as Array<[keyof typeof FIELD_WEIGHTS, number]>) {
    const candidate = candidates[field];
    if (!candidate || !candidate.value.trim()) {
      continue;
    }
    score += weight * Math.min(1, Math.max(0, candidate.confidence));
  }
  return Math.round(score);
}

function confidenceLevel(score: number): ForwardedConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "high";
  if (score >= LOW_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

function statusFromScore(score: number): ForwardedParsingStatus {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "auto-parsed";
  if (score >= LOW_CONFIDENCE_THRESHOLD) return "needs-review";
  return "needs-user-input";
}

function countUniqueFlightNumbers(text: string): number {
  const seen = new Set<string>();
  for (const match of text.matchAll(FLIGHT_NUMBER_RE)) {
    const code = match[1]?.toUpperCase() ?? "";
    const idx = match.index ?? 0;
    const window = text.slice(idx, Math.min(text.length, idx + 120));
    if (isDeniedFlightAirlineCode(code, window)) continue;
    seen.add(`${code}${match[2] ?? ""}`);
  }
  return seen.size;
}

function isFlightCandidate(candidate: CandidateMap): boolean {
  return normalizeType(candidate.type?.value ?? "") === "flight" || Boolean(candidate.flightNumber?.value?.trim());
}

function flightLegKey(candidate: CandidateMap): string {
  const flightNumber = (candidate.flightNumber?.value ?? "").replace(/\s+/gu, "").toUpperCase();
  const dep = (candidate.departureAirport?.value ?? "").trim().toUpperCase();
  const arr = (candidate.arrivalAirport?.value ?? "").trim().toUpperCase();
  const time = (candidate.localTime?.value ?? "").trim().slice(0, 16);
  if (flightNumber) return `${flightNumber}|${dep}|${arr}|${time}`;
  return `${dep}|${arr}|${time}`;
}

function enrichFlightCandidate(candidate: CandidateMap): CandidateMap {
  const dep = candidate.departureAirport?.value?.trim().toUpperCase().slice(0, 4);
  const arr = candidate.arrivalAirport?.value?.trim().toUpperCase().slice(0, 4);
  const flightNumber = candidate.flightNumber?.value?.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
  const next: CandidateMap = { ...candidate };
  if (dep && arr && !next.location?.value?.trim()) {
    next.location = { value: `${dep} -> ${arr}`, confidence: 0.9, source: candidate.type?.source ?? "regex" };
  }
  if (flightNumber && dep && arr && !next.title?.value?.trim()) {
    next.title = { value: `${flightNumber} ${dep} → ${arr}`, confidence: 0.9, source: candidate.type?.source ?? "regex" };
  }
  if (flightNumber && !next.type?.value) {
    next.type = { value: "flight", confidence: 0.9, source: candidate.type?.source ?? "regex" };
  }
  return next;
}

function extractAirportsFromWindow(window: string): { dep?: string; arr?: string } {
  const parenAirports = [...window.matchAll(/\(([A-Z]{3})\)/gu)]
    .map((match) => match[1] ?? "")
    .filter(
      (code) =>
        code.length === 3 &&
        !AIRPORT_WORD_DENYLIST.has(code) &&
        !COUNTRY_CODE_DENYLIST.has(code) &&
        code !== "ITA",
    );
  if (parenAirports.length >= 2) {
    return { dep: parenAirports[0], arr: parenAirports[1] };
  }

  const depLine = window.match(/(?:Departure|Depart(?:s|ure)?|From)[:\s]+([A-Z]{3})\b/iu);
  const arrLine = window.match(/(?:Arrival|Arrive(?:s)?|To)[:\s]+([A-Z]{3})\b/iu);
  if (depLine?.[1] && arrLine?.[1]) {
    const dep = depLine[1].toUpperCase();
    const arr = arrLine[1].toUpperCase();
    if (
      !AIRPORT_WORD_DENYLIST.has(dep) &&
      !COUNTRY_CODE_DENYLIST.has(dep) &&
      !AIRPORT_WORD_DENYLIST.has(arr) &&
      !COUNTRY_CODE_DENYLIST.has(arr)
    ) {
      return { dep, arr };
    }
  }

  const airports = [...window.matchAll(/\b([A-Z]{3})\b/gu)]
    .map((match) => match[1] ?? "")
    .filter((code) => code.length === 3 && !AIRPORT_WORD_DENYLIST.has(code) && !COUNTRY_CODE_DENYLIST.has(code));
  const routeMatch = window.match(/\b([A-Z]{3})\s*(?:->|→|—|–|-)\s*([A-Z]{3})\b/u);
  if (routeMatch?.[1] && routeMatch[2]) {
    return { dep: routeMatch[1], arr: routeMatch[2] };
  }
  if (airports.length >= 2) {
    return { dep: airports[0], arr: airports[1] };
  }
  return { dep: airports[0] };
}

function extractFlightLegWindow(lineAwareText: string, flightMatchIndex: number, flightTokenLength: number): string {
  const start = flightMatchIndex;
  const afterFlight = flightMatchIndex + flightTokenLength;
  const remainder = lineAwareText.slice(afterFlight);
  const nextFlightOffset = remainder.search(NEXT_FLIGHT_TOKEN_RE);
  const end =
    nextFlightOffset >= 0
      ? afterFlight + nextFlightOffset
      : Math.min(lineAwareText.length, afterFlight + 420);
  return lineAwareText.slice(start, end);
}

function extractFlightLegsFromRegex(lineAwareText: string, sharedFields: CandidateMap): CandidateMap[] {
  const uniqueFlightCount = countUniqueFlightNumbers(lineAwareText);
  const hasFlightContext = FLIGHT_CONTEXT_RE.test(lineAwareText) || uniqueFlightCount >= 2;
  if (!hasFlightContext || uniqueFlightCount === 0) return [];
  const legs: CandidateMap[] = [];
  const seen = new Set<string>();

  for (const match of lineAwareText.matchAll(FLIGHT_NUMBER_RE)) {
    const code = match[1]?.toUpperCase() ?? "";
    const num = match[2] ?? "";
    const idx = match.index ?? 0;
    const tokenLength = match[0]?.length ?? `${code}${num}`.length;
    const window = extractFlightLegWindow(lineAwareText, idx, tokenLength);
    if (isDeniedFlightAirlineCode(code, window)) continue;
    const flightNumber = `${code}${num}`;
    if (seen.has(flightNumber)) continue;
    seen.add(flightNumber);

    const { dep, arr } = extractAirportsFromWindow(window);
    const localTimeResult = extractLegDepartureTime(window);
    const leg: CandidateMap = {
      type: { value: "flight", confidence: 0.88, source: "regex" },
      flightNumber: { value: flightNumber, confidence: 0.92, source: "regex" },
    };
    if (dep) leg.departureAirport = { value: dep, confidence: 0.86, source: "regex" };
    if (arr) leg.arrivalAirport = { value: arr, confidence: 0.86, source: "regex" };
    if (localTimeResult) {
      leg.localTime = { value: localTimeResult.localTime, confidence: localTimeResult.confidence, source: "regex" };
    }
    if (sharedFields.confirmationCode?.value) leg.confirmationCode = sharedFields.confirmationCode;
    if (sharedFields.provider?.value) leg.provider = sharedFields.provider;
    legs.push(enrichFlightCandidate(leg));
  }
  return legs;
}

function mergeFlightLegSources(
  aiCandidates: CandidateMap[],
  regexCandidates: CandidateMap,
  candidates: CandidateMap,
  lineAwareText: string,
  flightEmail: boolean,
): CandidateMap[] {
  const regexLegs = extractFlightLegsFromRegex(lineAwareText, regexCandidates);
  const aiFlights = aiCandidates.filter(isFlightCandidate);
  const nonFlightMaps = aiCandidates
    .filter((candidate) => !isFlightCandidate(candidate))
    .map((candidate) => sanitizeTravelLocalTime(mergeCandidates(regexCandidates, candidate), lineAwareText));

  const mergeAiIntoLeg = (leg: CandidateMap): CandidateMap => {
    const flightNumber = leg.flightNumber?.value?.trim().toUpperCase().replace(/\s+/gu, "");
    const matchingAi = flightNumber
      ? aiFlights.find(
          (aiLeg) => (aiLeg.flightNumber?.value ?? "").trim().toUpperCase().replace(/\s+/gu, "") === flightNumber,
        )
      : undefined;
    const merged = matchingAi ? mergeCandidates(leg, matchingAi) : leg;
    return sanitizeTravelLocalTime(
      enrichFlightCandidate(applySharedFields(merged, regexCandidates)),
      lineAwareText,
    );
  };

  const byKey = new Map<string, CandidateMap>();
  for (const leg of regexLegs) {
    const prepared = mergeAiIntoLeg(leg);
    byKey.set(flightLegKey(prepared), prepared);
  }

  for (const aiLeg of aiFlights) {
    const flightNumber = (aiLeg.flightNumber?.value ?? "").trim().toUpperCase().replace(/\s+/gu, "");
    const prepared = sanitizeTravelLocalTime(
      enrichFlightCandidate(applySharedFields(aiLeg, regexCandidates)),
      lineAwareText,
    );
    const existingByFlightNumber = flightNumber
      ? [...byKey.values()].find(
          (leg) => (leg.flightNumber?.value ?? "").trim().toUpperCase().replace(/\s+/gu, "") === flightNumber,
        )
      : undefined;
    if (existingByFlightNumber) {
      const merged = sanitizeTravelLocalTime(
        enrichFlightCandidate(mergeCandidates(existingByFlightNumber, aiLeg)),
        lineAwareText,
      );
      byKey.delete(flightLegKey(existingByFlightNumber));
      byKey.set(flightLegKey(merged), merged);
      continue;
    }
    const key = flightLegKey(prepared);
    if (!byKey.has(key)) {
      byKey.set(key, prepared);
    }
  }

  let flightMaps = [...byKey.values()];

  // AI often collapses a full round-trip/connecting itinerary into one object — prefer regex legs.
  if (regexLegs.length > flightMaps.length) {
    flightMaps = regexLegs.map((leg) => mergeAiIntoLeg(leg));
  } else if (regexLegs.length > aiFlights.length && regexLegs.length >= 2) {
    flightMaps = regexLegs.map((leg) => mergeAiIntoLeg(leg));
  }

  if (flightMaps.length === 0) {
    if (aiFlights.length > 1) {
      flightMaps = aiFlights.map((aiLeg) =>
        sanitizeTravelLocalTime(enrichFlightCandidate(applySharedFields(aiLeg, regexCandidates)), lineAwareText),
      );
    } else if (aiFlights.length === 1) {
      flightMaps = [sanitizeTravelLocalTime(mergeCandidates(regexCandidates, aiFlights[0]), lineAwareText)];
    } else if (flightEmail) {
      flightMaps = [sanitizeTravelLocalTime(candidates, lineAwareText)];
    } else {
      flightMaps = [sanitizeTravelLocalTime(candidates, lineAwareText)];
    }
  }

  return [...flightMaps, ...nonFlightMaps];
}

function candidateMapsToDrafts(
  candidateMaps: CandidateMap[],
  lineAwareText: string,
  parserNotes: string[],
): ForwardedReservationDraft[] {
  return dedupeDrafts(
    candidateMaps
      .map((candidate) =>
        buildDraft(enrichFlightCandidate(sanitizeTravelLocalTime(candidate, lineAwareText)), parserNotes),
      )
      .filter(
        (draft) =>
          Boolean(
            draft.flightNumber?.trim() ||
              draft.title.trim() ||
              draft.provider.trim() ||
              draft.confirmationCode.trim() ||
              draft.localTime.trim() ||
              draft.location.trim(),
          ),
      ),
  );
}

/** Regex-only multi-leg extraction for tests and fallback parsing. */
export function extractFlightLegsFromEmailBody(rawText: string): Array<{
  flightNumber: string;
  localTime: string;
  departureAirport: string;
  arrivalAirport: string;
}> {
  const prepared = prepareEmailBodyForParsing(rawText);
  const shared = buildRegexCandidates({
    text: prepared.collapsed,
    lineAwareText: prepared.lineAware,
    subject: "",
    from: "",
    parserNotes: [],
  });
  return extractFlightLegsFromRegex(prepared.lineAware, shared).map((leg) => ({
    flightNumber: leg.flightNumber?.value ?? "",
    localTime: leg.localTime?.value ?? "",
    departureAirport: leg.departureAirport?.value ?? "",
    arrivalAirport: leg.arrivalAirport?.value ?? "",
  }));
}

function buildRegexCandidates(input: {
  text: string;
  lineAwareText: string;
  subject: string;
  from: string;
  parserNotes: string[];
}): CandidateMap {
  const { text, lineAwareText, subject, from, parserNotes } = input;
  const combined = `${subject}\n${text}`.trim();
  const candidates: CandidateMap = {};

  const activityFacts = extractActivityTicketFacts(lineAwareText, subject);
  if (activityFacts) {
    candidates.type = { value: "dinner", confidence: 0.9, source: "regex" };
    if (activityFacts.title) {
      candidates.title = { value: activityFacts.title, confidence: 0.86, source: "regex" };
    }
    if (activityFacts.provider) {
      candidates.provider = { value: activityFacts.provider, confidence: 0.88, source: "regex" };
    }
    if (activityFacts.confirmationCode) {
      candidates.confirmationCode = { value: activityFacts.confirmationCode, confidence: 0.92, source: "regex" };
    }
  }

  const hasFlightContext = !activityFacts && FLIGHT_CONTEXT_RE.test(combined);

  const flightNumberMatch = hasFlightContext ? combined.match(/\b([A-Z]{2})\s?(\d{2,4})\b/u) : null;
  if (
    !activityFacts &&
    flightNumberMatch &&
    !isDeniedFlightAirlineCode(flightNumberMatch[1] ?? "", combined)
  ) {
    const flightNumber = `${flightNumberMatch[1]} ${flightNumberMatch[2]}`;
    candidates.type = {
      value: "flight",
      confidence: 0.95,
      source: "regex",
    };
    candidates.title = {
      value: `${flightNumber} reservation`,
      confidence: 0.88,
      source: "regex",
    };
    candidates.flightNumber = {
      value: flightNumber.replace(/\s+/gu, "").toUpperCase(),
      confidence: 0.95,
      source: "regex",
    };
  } else if (!activityFacts) {
    for (const keyword of RESERVATION_TYPE_KEYWORDS) {
      if (keyword.pattern.test(combined)) {
        candidates.type = {
          value: keyword.type,
          confidence: keyword.confidence,
          source: "regex",
        };
        break;
      }
    }
  }

  const routeMatch = combined.match(/\b([A-Z]{3})\s*(?:->|to|-)\s*([A-Z]{3})\b/u);
  if (routeMatch) {
    candidates.location = {
      value: `${routeMatch[1]} -> ${routeMatch[2]}`,
      confidence: 0.84,
      source: "regex",
    };
  } else {
    const airportMentions = [...combined.matchAll(/\b(?:from|to|via|airport|terminal)\s+([A-Z]{3})\b/gu)]
      .map((match) => match[1])
      .filter((value): value is string => typeof value === "string");
    if (airportMentions[0]) {
      candidates.location = {
        value: airportMentions[1] ? `${airportMentions[0]} -> ${airportMentions[1]}` : `${airportMentions[0]} airport`,
        confidence: 0.66,
        source: "regex",
      };
    }
  }

  const hotelPropertyName = extractHotelPropertyName(subject, text);
  if (hotelPropertyName) {
    candidates.type = candidates.type ?? { value: "hotel", confidence: 0.86, source: "regex" };
    // Property name always wins as title — never leave Booking.com as the headline (I25).
    candidates.title = {
      value: hotelPropertyName,
      confidence: 0.9,
      source: "regex",
    };
  }

  // Airbnb / OTA "Entire home" without the word hotel still means a stay.
  if (
    !candidates.type &&
    /\b(?:entire home|entire place|private room|hosted by|airbnb|vrbo)\b/iu.test(combined)
  ) {
    candidates.type = { value: "hotel", confidence: 0.84, source: "regex" };
  }

  const extractedConfirmation = extractConfirmationCodeFromText(combined);
  if (extractedConfirmation) {
    candidates.confirmationCode = {
      value: extractedConfirmation,
      confidence: 0.94,
      source: "regex",
    };
  }

  const railFacts = extractRailTicketFacts(lineAwareText, subject);
  if (railFacts) {
    candidates.type = { value: "train", confidence: 0.9, source: "regex" };
    if (railFacts.title) {
      candidates.title = { value: railFacts.title, confidence: 0.88, source: "regex" };
    }
    if (railFacts.provider) {
      candidates.provider = { value: railFacts.provider, confidence: 0.86, source: "regex" };
    }
    if (railFacts.localTime) {
      candidates.localTime = { value: railFacts.localTime, confidence: 0.9, source: "regex" };
    }
    if (railFacts.location) {
      candidates.location = { value: railFacts.location, confidence: 0.88, source: "regex" };
    }
    if (railFacts.confirmationCode) {
      candidates.confirmationCode = { value: railFacts.confirmationCode, confidence: 0.86, source: "regex" };
    }
    if (railFacts.timezone) {
      candidates.timezone = { value: railFacts.timezone, confidence: 0.8, source: "regex" };
    }
    if (railFacts.notes) {
      candidates.notes = { value: railFacts.notes, confidence: 0.7, source: "regex" };
    }
  }

  const reservationType = normalizeType(candidates.type?.value ?? "") ?? undefined;

  // I39: labeled Check-in / Checkout cards (including yearless Airbnb "Sat, Sep 12").
  const labeledStay =
    reservationType === "hotel" || /\bcheck[\s-]?in\b/iu.test(lineAwareText)
      ? extractLabeledHotelStayDates(lineAwareText)
      : null;
  if (labeledStay) {
    candidates.type = candidates.type ?? { value: "hotel", confidence: 0.86, source: "regex" };
    candidates.localTime = {
      value: labeledStay.checkInLocalTime,
      confidence: 0.92,
      source: "regex",
    };
    candidates.checkOutDate = {
      value: labeledStay.checkOutDate,
      confidence: 0.92,
      source: "regex",
    };
  } else if (!candidates.localTime) {
    const bestLocalTime = extractBestLocalTimeCandidate(lineAwareText, reservationType);
    if (bestLocalTime) {
      candidates.localTime = {
        value: bestLocalTime.localTime,
        confidence: bestLocalTime.confidence,
        source: "regex",
      };
      if (bestLocalTime.localTime.endsWith(" 12:00")) {
        parserNotes.push("Time not found in email; defaulted to 12:00 local time for review.");
      }
    }

    // Hotel checkout — Booking.com: "Check-out\nTuesday, September 8, 2026"
    if (reservationType === "hotel" || /\bcheck[\s-]?out\b/iu.test(lineAwareText)) {
      const checkoutWindow =
        lineAwareText.match(/\bcheck[\s-]?out\b[:\s]*\n?\s*([^\n]{3,80})/iu)?.[1] ??
        lineAwareText.match(/\bcheck[\s-]?out\b[^\n]{0,120}/iu)?.[0] ??
        "";
      const checkoutRaw = checkoutWindow
        .replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+/iu, "")
        .match(
          /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|20\d{2}-\d{2}-\d{2}|\d{1,2}-[A-Za-z]{3}-\d{4})\b/iu,
        )?.[1];
      const checkoutIso = checkoutRaw ? parseDateCandidate(checkoutRaw) : null;
      if (checkoutIso) {
        candidates.checkOutDate = {
          value: checkoutIso,
          confidence: 0.9,
          source: "regex",
        };
      }
    }
  }

  // Hotel city from Address line (Airbnb) — never leave location empty when address is present.
  const hotelLocation = extractHotelAddressLocation(lineAwareText);
  const isHotelDraft =
    normalizeType(candidates.type?.value ?? "") === "hotel" || Boolean(labeledStay) || Boolean(hotelPropertyName);
  if (hotelLocation && isHotelDraft) {
    candidates.location = {
      value: hotelLocation,
      confidence: 0.88,
      source: "regex",
    };
  }

  const timezone = resolveTimezone(combined);
  if (timezone && !(timezone === "Etc/UTC" && candidates.timezone)) {
    candidates.timezone = {
      value: timezone,
      confidence: timezone === "Etc/UTC" ? 0.45 : 0.8,
      source: "regex",
    };
  }

  const airlineProvider = extractAirlineProvider(subject, text);
  if (airlineProvider) {
    candidates.provider = {
      value: airlineProvider,
      confidence: 0.9,
      source: "regex",
    };
  } else if (!candidates.provider) {
    const providerFromSender = formatProviderFromSender(from);
    // Forward envelope From: you@gmail.com is not the airline.
    if (providerFromSender && !/^gmail$/iu.test(providerFromSender)) {
      candidates.provider = {
        value: providerFromSender,
        confidence: 0.7,
        source: "regex",
      };
    }
  }

  if (!candidates.title) {
    const normalizedSubject = normalizeWhitespace(subject);
    if (normalizedSubject && !OTA_TITLE_DENYLIST.test(normalizedSubject)) {
      // Strip leading OTA brand / Fwd: wrappers from subjects.
      const withoutOta = normalizedSubject
        .replace(/^(?:fwd|fw|re)\s*:\s*/iu, "")
        .replace(/^(booking\.com|expedia|hotels\.com|airbnb|vrbo)\s*[:\-]?\s*/iu, "")
        .trim();
      if (withoutOta.length >= 3 && !OTA_TITLE_DENYLIST.test(withoutOta)) {
        const withCode =
          extractedConfirmation && !withoutOta.toUpperCase().includes(extractedConfirmation)
            ? `${withoutOta} (${extractedConfirmation})`
            : withoutOta;
        candidates.title = {
          value: withCode,
          confidence: 0.62,
          source: "regex",
        };
      }
    }
  }

  // Never keep an OTA brand as the hotel title when we have a real provider badge.
  if (candidates.title?.value && OTA_TITLE_DENYLIST.test(candidates.title.value)) {
    delete candidates.title;
  }

  return candidates;
}

async function runAiFallback(
  rawEmailText: string,
  subject = "",
  fewShotExamples: FewShotParseExample[] = [],
): Promise<CandidateMap[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    logger.warn("AI fallback skipped: ANTHROPIC_API_KEY is missing.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      rawEmailText,
      rawEmailTextLength: rawEmailText.length,
    });
    return [];
  }

  const emailContext = subject.trim() ? `Subject: ${subject}\n\n${rawEmailText}` : rawEmailText;
  const fewShotBlock = formatFewShotBlock(fewShotExamples);
  const aiPrompt = [
    "Extract every travel reservation found in this email.",
    "Return strict JSON only with this shape:",
    '{ "reservations": [ { "type": "", "title": "", "provider": "", "confirmationCode": "", "localTime": "", "checkOutDate": "", "timezone": "", "location": "", "notes": "", "flightNumber": "", "departureAirport": "", "arrivalAirport": "" } ] }',
    "IMPORTANT: This may be a multi-leg itinerary. Scan for EVERY individual flight segment. For example HND→HNL→SEA→ONT has 3 flights — return 3 separate objects in reservations[]. Each object must have its own flightNumber, departureAirport, arrivalAirport, and localTime (departure time for that specific leg).",
    "Use type values only: flight, hotel, train, ride, dinner. Use \"dinner\" for restaurant reservations, tours, excursions, boat trips, classes, tastings, or any other bookable activity that is not a flight/hotel/train/car ride.",
    "CRITICAL for localTime: For flights, use the scheduled DEPARTURE time (not email send time, not boarding time, not purchase/booking/transaction/payment date). Ignore 'Date:' and 'Sent:' lines from forward headers. For hotels, use Check-in / Checkout cards — Airbnb often shows 'Sat, Sep 12' without a year; take the year from another date in the email (e.g. payment Aug 29, 2026 → stay year 2026). NEVER use payment scheduled dates as check-in. Default hotel check-in time to 15:00 when only 'After 3:00 PM' is shown.",
    "For hotels, set title to the PROPERTY name (e.g. Casa de Elena or Cosy, Romantic & Stylish Studio), NEVER Booking.com / Expedia / Airbnb. Put the OTA in provider. Phrases like \"You're confirmed at Casa de Elena\" mean title=Casa de Elena, provider=Booking.com.",
    "For hotels, set checkOutDate to the check-out date in YYYY-MM-DD format. The email may use formats like 'Friday, 29-May-2026', 'May 29, 2026', or yearless 'Tue, Sep 15' — convert to YYYY-MM-DD. Also set localTime to the check-in date and time e.g. '2026-09-12 15:00'. For flights, leave checkOutDate empty.",
    "The departure time is the scheduled time the plane leaves the gate. Format: 'YYYY-MM-DD HH:mm' in 24-hour.",
    "For flights, set flightNumber to IATA airline code + flight number. If the email says 'Alaska Airlines Flight 832' write AS832. If it says 'Hawaiian Airlines Flight 12' write HA12. Common IATA codes: AS=Alaska Airlines, HA=Hawaiian Airlines, UA=United Airlines, AA=American Airlines, DL=Delta, WN=Southwest, B6=JetBlue, KE=Korean Air, NH=ANA, JL=JAL. NEVER use just the number alone — always prefix with the 2-letter IATA code. Never use credit card numbers like VI3557.",
    "For flights, set departureAirport to the IATA code of the origin airport and arrivalAirport to the IATA code of the destination. These are always in the email.",
    "For timezone: use the IATA timezone of the DEPARTURE airport city e.g. Pacific/Honolulu, America/New_York, Asia/Tokyo.",
    "For location: for flights set the departure airport name or city. For hotels set the stay city from the Address line (e.g. Venice) — not the street alone.",
    "If any field is not explicitly stated in the email, return empty string. NEVER invent or guess dates, codes, or any other field.",
    "Do not include explanation text.",
    "",
    ...(fewShotBlock ? [fewShotBlock, ""] : []),
    emailContext,
  ].join("\n");
  logger.info("AI fallback request started.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    rawEmailText,
    rawEmailTextLength: rawEmailText.length,
    aiPrompt,
  });

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,  // 8000 handles up to ~30 flight legs safely
      temperature: 0,
      system:
        "You extract travel reservations from forwarded emails. Return ONLY a JSON object with a reservations array. CRITICAL RULES:\n(1) For FLIGHTS: scan the entire email for every individual flight segment. A 3-leg itinerary like HND→HNL→SEA→ONT has 3 separate flights — return 3 objects. NEVER merge segments into one. Each segment has its own flight number, departure airport, arrival airport, and departure time.\n(2) type=flight ONLY when a flight number or airline is present. type=hotel for hotels even if they mention arrival/departure dates.\n(3) localTime = scheduled DEPARTURE time of that specific flight leg in YYYY-MM-DD HH:mm 24-hour format. Never use email send time, purchase date, booking date, transaction date, forward-header Date/Sent metadata, or legal/visa boilerplate dates (e.g. 'Effective March 15, 2016' eTA/ESTA notices).\n(4) confirmationCode = the airline PNR / reservation code (e.g. Reservation code Z84T4Z). Never use English words like carefully, receipt, or confirmation.\n(5) flightNumber = 2-letter IATA code + flight number. If email says 'Alaska Airlines Flight 832' write AS832. If 'Hawaiian Airlines Flight 12' write HA12. Key codes: AS=Alaska, HA=Hawaiian, UA=United, AA=American, DL=Delta, KE=Korean Air, NH=ANA, JL=JAL, AZ=ITA Airways, FR=Ryanair, U2=easyJet, W4=Wizz Air. NEVER return number alone. VI3557 is a credit card, NOT a flight number.\n(6) departureAirport = IATA code of origin. arrivalAirport = IATA code of destination. Both must be set for every flight. Bari=BRI, Venice=VCE.\n(7) timezone = IANA timezone of the departure city e.g. Asia/Tokyo, Pacific/Honolulu, America/Los_Angeles, Europe/Rome.\n(8) location = departure city or airport name.\n(9) If a field is not in the email, use empty string. Never guess or invent values. If only a reservation code is present and flight times are in an unread PDF, leave localTime/flightNumber empty.",
      messages: [
        {
          role: "user",
          content: aiPrompt,
        },
      ],
    });
    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    logger.info("AI fallback raw response received.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      aiResponseRaw: text,
      aiResponseLength: text.length,
    });
    const parsedCandidates = parseAiResponse(text);
    logger.info("AI fallback parsed reservations.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      aiReservationCount: parsedCandidates.length,
    });
    return parsedCandidates;
  } catch (error) {
    logger.error("AI fallback call failed.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      error: error instanceof Error ? error.message : "unknown",
      rawEmailText,
      aiPrompt,
    });
    return [];
  }
}

function buildDraft(candidates: CandidateMap, parserNotes: string[]): ForwardedReservationDraft {
  const typeValue = normalizeType(candidates.type?.value ?? "") ?? "ride";
  const notesSections = [
    normalizeWhitespace(candidates.notes?.value ?? ""),
    ...parserNotes.map((note) => normalizeWhitespace(note)).filter((note) => note.length > 0),
  ].filter((value) => value.length > 0);

  return {
    type: typeValue,
    title: normalizeWhitespace(candidates.title?.value ?? ""),
    provider: normalizeWhitespace(candidates.provider?.value ?? ""),
    localTime: normalizeWhitespace(candidates.localTime?.value ?? ""),
    timezone: sanitizeTimezoneValue(candidates.timezone?.value ?? "Etc/UTC"),
    location: normalizeWhitespace(candidates.location?.value ?? ""),
    confirmationCode: normalizeConfirmationCode(candidates.confirmationCode?.value ?? ""),
    notes: sanitizeTravelerNotes(notesSections.join("\n")).replace(/\n/gu, " ").trim(),
    flightNumber:
      typeValue === "flight"
        ? (candidates.flightNumber?.value ?? "").replace(/[^A-Za-z0-9]/gu, "").toUpperCase()
        : "",
    departureAirport:
      typeValue === "flight"
        ? (candidates.departureAirport?.value ?? "").trim().toUpperCase().slice(0, 4)
        : "",
    arrivalAirport:
      typeValue === "flight"
        ? (candidates.arrivalAirport?.value ?? "").trim().toUpperCase().slice(0, 4)
        : "",
    checkOutDate:
      typeValue === "hotel"
        ? normalizeWhitespace(candidates.checkOutDate?.value ?? "")
        : "",
  };
}

function missingFieldsFromDraft(draft: ForwardedReservationDraft): ForwardedReservationField[] {
  const missing = new Set<ForwardedReservationField>();
  for (const field of REQUIRED_FIELDS) {
    // Airbnb confirmation emails often omit a code in the summary body (I39).
    if (draft.type === "hotel" && field === "confirmationCode") continue;
    if (!(draft[field] ?? "").trim()) {
      missing.add(field);
    }
  }
  if (draft.type === "hotel" && !(draft.checkOutDate ?? "").trim()) {
    missing.add("checkOutDate");
  }
  return [...missing];
}

export interface AssessForwardedDraftInput {
  type?: string | null;
  title?: string | null;
  provider?: string | null;
  confirmationCode?: string | null;
  localTime?: string | null;
  timezone?: string | null;
  location?: string | null;
  notes?: string | null;
  flightNumber?: string | null;
  checkOutDate?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  flightDepartureAirport?: string | null;
  flightArrivalAirport?: string | null;
}

export interface AssessForwardedDraftResult {
  missingFields: ForwardedReservationField[];
  confidenceScore: number;
  parsingStatus: ForwardedParsingStatus;
}

/**
 * Per-draft gate inputs (F7). Uses the same missing-field penalty and 70/40
 * status bands as the email-level parse result — so a strong first leg cannot
 * launder a weak second draft in a multi-booking forward.
 */
export function assessForwardedDraft(
  draft: AssessForwardedDraftInput,
  emailScore: number,
): AssessForwardedDraftResult {
  const typeValue = (draft.type ?? "").trim().toLowerCase();
  const normalizedType: ForwardedReservationType =
    typeValue === "flight" ||
    typeValue === "hotel" ||
    typeValue === "train" ||
    typeValue === "ride" ||
    typeValue === "dinner"
      ? typeValue
      : "ride";
  const normalized: ForwardedReservationDraft = {
    type: normalizedType,
    title: (draft.title ?? "").trim(),
    provider: (draft.provider ?? "").trim(),
    confirmationCode: (draft.confirmationCode ?? "").trim(),
    localTime: (draft.localTime ?? "").trim(),
    timezone: (draft.timezone ?? "").trim() || "Etc/UTC",
    location: (draft.location ?? "").trim(),
    notes: (draft.notes ?? "").trim(),
    flightNumber: (draft.flightNumber ?? "").trim(),
    checkOutDate: (draft.checkOutDate ?? "").trim(),
    departureAirport: (
      draft.departureAirport ??
      draft.flightDepartureAirport ??
      ""
    )
      .trim()
      .toUpperCase()
      .slice(0, 4),
    arrivalAirport: (draft.arrivalAirport ?? draft.flightArrivalAirport ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 4),
  };
  const missingFields = missingFieldsFromDraft(normalized);
  const baseScore = Number.isFinite(emailScore) ? emailScore : 0;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(baseScore - missingFields.length * 6)));
  return {
    missingFields,
    confidenceScore,
    parsingStatus: statusFromScore(confidenceScore),
  };
}

function draftIdentityKey(draft: ForwardedReservationDraft): string {
  if (draft.type === "flight") {
    return [
      "flight",
      draft.flightNumber.trim().toUpperCase(),
      draft.departureAirport.trim().toUpperCase(),
      draft.arrivalAirport.trim().toUpperCase(),
      draft.localTime.trim().toLowerCase(),
    ].join("|");
  }
  return [
    draft.type.trim().toLowerCase(),
    draft.title.trim().toLowerCase(),
    draft.provider.trim().toLowerCase(),
    draft.localTime.trim().toLowerCase(),
    draft.location.trim().toLowerCase(),
    draft.confirmationCode.trim().toLowerCase(),
  ].join("|");
}

function draftRichness(draft: ForwardedReservationDraft): number {
  let score = 0;
  if (draft.flightNumber?.trim()) score += 4;
  if (draft.departureAirport?.trim()) score += 2;
  if (draft.arrivalAirport?.trim()) score += 2;
  if (draft.localTime.trim() && !draft.localTime.endsWith(" 12:00")) score += 3;
  else if (draft.localTime.trim()) score += 1;
  if (draft.confirmationCode.trim()) score += 1;
  return score;
}

function dedupeDrafts(drafts: ForwardedReservationDraft[]): ForwardedReservationDraft[] {
  const flightByNumber = new Map<string, ForwardedReservationDraft>();
  const output: ForwardedReservationDraft[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    if (draft.type === "flight" && draft.flightNumber?.trim()) {
      const fnKey = draft.flightNumber.trim().toUpperCase();
      const existing = flightByNumber.get(fnKey);
      if (!existing || draftRichness(draft) > draftRichness(existing)) {
        flightByNumber.set(fnKey, draft);
      }
      continue;
    }
    const key = draftIdentityKey(draft);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(draft);
  }

  const flights = [...flightByNumber.values()].sort((a, b) => a.localTime.localeCompare(b.localTime));
  return [...flights, ...output];
}

function chooseBodyText(text: string, html: string): { parsedText: string; lineAwareText: string; imageBasedEmail: boolean } {
  const lineAwareRaw = text.replace(/\r\n/g, "\n");
  const lineAwareHtml = html.trim() ? htmlToLineAwareText(html) : "";
  const rawFlightCount = countUniqueFlightNumbers(lineAwareRaw);
  const htmlFlightCount = countUniqueFlightNumbers(lineAwareHtml);
  let lineAwareText = lineAwareRaw;
  if (
    htmlFlightCount > rawFlightCount ||
    (htmlFlightCount > 0 && lineAwareHtml.length > lineAwareRaw.length * 1.1) ||
    (lineAwareHtml.length >= MIN_READABLE_TEXT_LENGTH && lineAwareRaw.trim().length < MIN_READABLE_TEXT_LENGTH)
  ) {
    lineAwareText = lineAwareHtml;
  }
  const normalizedText = normalizeWhitespace(lineAwareText);
  if (normalizedText.length >= MIN_READABLE_TEXT_LENGTH) {
    return {
      parsedText: normalizeWhitespace(mergePdfSectionIntoBody(lineAwareText, lineAwareRaw)),
      lineAwareText: mergePdfSectionIntoBody(lineAwareText, lineAwareRaw),
      imageBasedEmail: false,
    };
  }
  const strippedHtml = normalizeWhitespace(lineAwareHtml);
  if (strippedHtml.length >= MIN_READABLE_TEXT_LENGTH) {
    const mergedHtml = mergePdfSectionIntoBody(lineAwareHtml, lineAwareRaw);
    return { parsedText: normalizeWhitespace(mergedHtml), lineAwareText: mergedHtml, imageBasedEmail: false };
  }
  const mergedFallback = mergePdfSectionIntoBody(lineAwareText || lineAwareHtml || strippedHtml, lineAwareRaw);
  return {
    parsedText: normalizeWhitespace(mergedFallback) || strippedHtml || normalizedText,
    lineAwareText: mergedFallback || lineAwareHtml || strippedHtml,
    imageBasedEmail: true,
  };
}

function hasMultipleFlightMentions(text: string): boolean {
  const flightMatches = [...text.matchAll(/\b([A-Z]{2})\s?(\d{2,4})\b/gu)]
    .map((match) => `${match[1] ?? ""}${match[2] ?? ""}`.toUpperCase())
    .filter((value) => value.length >= 4 && !COUNTRY_CODE_DENYLIST.has(value.slice(0, 2)));
  if (new Set(flightMatches).size > 1) return true;
  const airportMatches = [...text.matchAll(/\b([A-Z]{3})\b/gu)]
    .map((m) => m[1] ?? "")
    .filter((code) => !AIRPORT_WORD_DENYLIST.has(code) && !COUNTRY_CODE_DENYLIST.has(code));
  if (new Set(airportMatches).size > 2) return true;
  if (/segment\s+\d|flight\s+\d\s+of\s+\d|\d\s+stop|\bconnecting\b|\blayover\b|\boutbound\b|\binbound\b|\breturn(?:ing)?\b|\bround[\s-]?trip\b/iu.test(text)) return true;
  return false;
}

export async function parseForwardedEmail(input: ForwardedEmailParseInput): Promise<ForwardedEmailParseResult> {
  const rawText = input.text ?? "";
  const rawHtml = input.html ?? "";
  logger.info("Email parser received raw input.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    rawSubject: input.subject ?? "",
    rawFrom: input.from ?? "",
    rawText,
    rawHtml,
    rawTextLength: rawText.length,
    rawHtmlLength: rawHtml.length,
  });

  const subject = normalizeWhitespace(input.subject ?? "");
  const from = normalizeWhitespace(input.from ?? "");
  const text = input.text ?? "";
  const html = input.html ?? "";
  const parserNotes: string[] = [];
  const chosenBody = chooseBodyText(text, html);
  const imageBasedEmail = chosenBody.imageBasedEmail;
  const prepared = prepareEmailBodyForParsing(chosenBody.lineAwareText || chosenBody.parsedText);
  const parsedText = prepared.collapsed;
  const lineAwareText = prepared.lineAware;
  const multiFlightDetected = hasMultipleFlightMentions(`${subject}\n${parsedText}`);
  const pdfAttached = hasPdfAttachment(input.attachments);

  if (pdfAttached) {
    parserNotes.push("This email has a PDF attachment that may contain your confirmation details");
    parserNotes.push("Check the attached PDF for your confirmation code");
  }

  const regexCandidates = sanitizeTravelLocalTime(
    buildRegexCandidates({
      text: parsedText,
      lineAwareText,
      subject,
      from,
      parserNotes,
    }),
    lineAwareText,
  );
  let candidates = regexCandidates;
  let score = scoreCandidates(candidates);
  let usedAiFallback = false;
  let aiCandidates: CandidateMap[] = [];
  // Always run AI for flight emails — regex only catches one flight,
  // AI is needed to extract all legs from multi-segment confirmations
  const likelyFlightEmail =
    /\bflight\b|\boarding\b|\bairport\b|\bdeparture\b|\barrival\b|\bitinerary\b|\bsegment\b|\bconnecting\b|\boutbound\b|\breturn\b/iu.test(
      `${subject}\n${parsedText}\n${lineAwareText}`,
    );
  const shouldAttemptAiFallback = multiFlightDetected || likelyFlightEmail || (!imageBasedEmail && score < HIGH_CONFIDENCE_THRESHOLD);

  if (shouldAttemptAiFallback) {
    logger.info("Email parser attempting AI fallback.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      scoreBeforeAiFallback: score,
      threshold: HIGH_CONFIDENCE_THRESHOLD,
      multiFlightDetected,
      imageBasedEmail,
      parsedText,
      parsedTextLength: parsedText.length,
    });
    aiCandidates = await runAiFallback(lineAwareText, subject, input.fewShotExamples ?? []);
    if (aiCandidates.length > 0) {
      usedAiFallback = true;
      candidates = sanitizeTravelLocalTime(
        mergeCandidates(candidates, aiCandidates[0] ?? {}),
        lineAwareText,
      );
      score = scoreCandidates(candidates);
      // Do not surface internal AI-fallback jargon to travelers.
      logger.info("AI fallback extracted fields.", {
        scope: EMAIL_FORWARD_PARSER_SCOPE,
        aiCandidatesCount: aiCandidates.length,
        aiCandidates,
        scoreAfterAiFallback: score,
      });
    } else {
      logger.warn("AI fallback returned no extractable fields.", {
        scope: EMAIL_FORWARD_PARSER_SCOPE,
        scoreBeforeAiFallback: score,
      });
    }
  } else {
    logger.info("AI fallback not attempted.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      imageBasedEmail,
      multiFlightDetected,
      shouldAttemptAiFallback,
      scoreBeforeAiFallback: score,
      threshold: HIGH_CONFIDENCE_THRESHOLD,
    });
  }

  let allCandidateMaps: CandidateMap[];
  if (likelyFlightEmail || multiFlightDetected || aiCandidates.some(isFlightCandidate)) {
    allCandidateMaps = mergeFlightLegSources(
      aiCandidates,
      regexCandidates,
      candidates,
      lineAwareText,
      likelyFlightEmail || multiFlightDetected,
    );
  } else if (aiCandidates.length > 0) {
    allCandidateMaps = aiCandidates.map((candidate) =>
      sanitizeTravelLocalTime(mergeCandidates(regexCandidates, candidate), lineAwareText),
    );
  } else {
    allCandidateMaps = [sanitizeTravelLocalTime(candidates, lineAwareText)];
  }

  const drafts = candidateMapsToDrafts(allCandidateMaps, lineAwareText, parserNotes);
  const draft = drafts[0] ?? buildDraft(candidates, parserNotes);
  const missingFields = missingFieldsFromDraft(draft);
  const adjustedScore = Math.max(0, score - missingFields.length * 6);
  const boundedScore = imageBasedEmail ? Math.min(adjustedScore, 20) : adjustedScore;
  const parsingStatus = statusFromScore(boundedScore);
  const level = confidenceLevel(boundedScore);
  logger.info("Email parser extracted result.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    extractedCandidates: candidates,
    extractedDraft: draft,
    extractedDrafts: drafts,
    missingFields,
    parserNotes,
    confidenceScore: boundedScore,
    confidenceLevel: level,
    parsingStatus,
    usedAiFallback,
  });

  return {
    draft,
    drafts,
    confidenceScore: boundedScore,
    confidenceLevel: level,
    parsingStatus,
    missingFields,
    parserNotes,
    originalEmailText: parsedText || subject,
    imageBasedEmail,
    hasPdfAttachment: pdfAttached,
    usedAiFallback,
    parserVersion: EMAIL_FORWARD_PARSER_VERSION,
  };
}

