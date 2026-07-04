import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

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

const FLIGHT_CONTEXT_RE = /\b(flight|airline|boarding\s*pass|aircraft|operated\s*by|itinerary|segment)\b/iu;

const RESERVATION_TYPE_KEYWORDS: Array<{ type: ForwardedReservationType; pattern: RegExp; confidence: number }> = [
  { type: "flight", pattern: /\b(flight|airline|boarding|terminal|gate)\b/iu, confidence: 0.78 },
  { type: "hotel", pattern: /\b(hotel|check-?in|check out|room|suite|stay)\b/iu, confidence: 0.78 },
  { type: "train", pattern: /\b(train|rail|amtrak|station|platform)\b/iu, confidence: 0.75 },
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

export type ForwardedReservationType = "flight" | "hotel" | "train" | "ride";
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
}

function extractOriginalEmailFromForwardChain(text: string): string {
  // When an email is forwarded multiple times, Gmail adds repeated
  // "---------- Forwarded message ---------" headers. Extract the LAST
  // (deepest/original) block which contains the actual reservation data.
  const forwardMarker = "---------- Forwarded message ---------";
  const lastMarkerIdx = text.lastIndexOf(forwardMarker);
  if (lastMarkerIdx >= 0) {
    return text.slice(lastMarkerIdx);
  }
  // Also handle "-----Original Message-----" style
  const originalMarker = "-----Original Message-----";
  const lastOriginalIdx = text.lastIndexOf(originalMarker);
  if (lastOriginalIdx >= 0) {
    return text.slice(lastOriginalIdx);
  }
  return text;
}

const NON_TRAVEL_DATE_CONTEXT =
  /\b(?:purchase(?:d)?|booked on|booking date|transaction date|order date|payment date|issued on|date of issue|receipt date|ticketed on|sales date|invoice date|email sent|sent on|forwarded message)\b/iu;

const TRAVEL_DATE_CONTEXT =
  /\b(?:depart(?:ure|s|ing)?|arriv(?:al|es|ing)?|scheduled|flight|gate|terminal|boarding|check-?in|check out|leaves| lands|segment|itinerary)\b/iu;

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
  return {
    lineAware,
    collapsed: normalizeWhitespace(lineAware),
  };
}

function localTimeIsTravelContext(localTime: string, lineAwareText: string): boolean {
  const day = localTime.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return true;
  const lines = lineAwareText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const context = [lines[index - 1], lines[index], lines[index + 1]]
      .filter(Boolean)
      .join(" ");
    if (!context.includes(day) && !context.includes(day.replace(/-/gu, "/"))) continue;
    if (NON_TRAVEL_DATE_CONTEXT.test(context)) return false;
    if (TRAVEL_DATE_CONTEXT.test(context)) return true;
  }
  return !lines.some((line) => line.includes(day) && NON_TRAVEL_DATE_CONTEXT.test(line));
}

function sanitizeTravelLocalTime(candidates: CandidateMap, lineAwareText: string): CandidateMap {
  const localTime = candidates.localTime;
  if (!localTime?.value.trim()) return candidates;
  if (localTimeIsTravelContext(localTime.value, lineAwareText)) return candidates;
  const next = { ...candidates };
  delete next.localTime;
  return next;
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
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/iu,
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/iu,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" ");
    if (EMAIL_HEADER_DATE_LINE.test(line.trim())) continue;
    if (NON_TRAVEL_DATE_CONTEXT.test(context) && !TRAVEL_DATE_CONTEXT.test(context)) continue;

    for (const pattern of datePatterns) {
      const dateMatch = line.match(pattern) ?? context.match(pattern);
      const rawDate = dateMatch?.[1] ?? "";
      const parsedDate = parseDateCandidate(rawDate);
      if (!parsedDate) continue;

      let score = 0;
      if (TRAVEL_DATE_CONTEXT.test(context)) score += 5;
      if (/\b(?:depart|departure|leaves|scheduled)\b/iu.test(context)) score += 3;
      if (/^Departure\b/iu.test(line) || /^Departure\b/iu.test(lines[index - 1] ?? "")) score += 5;
      if (/\b(?:arrival|arrive|arriving|lands|landed)\b/iu.test(context)) score -= 4;
      if (reservationType === "hotel" && /\b(?:check-?in|check out|stay|night)\b/iu.test(context)) score += 4;
      if (NON_TRAVEL_DATE_CONTEXT.test(context)) score -= 8;

      const timeMatch =
        line.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu) ??
        line.match(/\b(\d{1,2}:\d{2})\b/u) ??
        (lines[index + 1] ?? "").match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu) ??
        (lines[index + 1] ?? "").match(/\b(\d{1,2}:\d{2})\b/u);
      const parsedTime = parseTimeTo24Hour(timeMatch?.[1] ?? "");
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
  const best = scored[0];
  if (!best || best.score < 1) return null;
  return {
    localTime: best.localTime,
    confidence: Math.min(0.82, 0.42 + best.score * 0.07),
  };
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

function stripHtml(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">")
      .replace(/&#39;/giu, "'")
      .replace(/&quot;/giu, '"'),
  );
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
  return null;
}

function formatProviderFromSender(sender: string): string {
  const domainMatch = sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/iu);
  const host = domainMatch?.[1]?.split(".")[0] ?? "";
  if (!host) {
    return "";
  }
  return host
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

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
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3]);
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
  const depLine = window.match(/Departure[:\s]+([A-Z]{3})\b/iu);
  const arrLine = window.match(/Arrival[:\s]+([A-Z]{3})\b/iu);
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
  const start = Math.max(0, flightMatchIndex - 40);
  const afterFlight = flightMatchIndex + flightTokenLength;
  const remainder = lineAwareText.slice(afterFlight);
  const nextFlightOffset = remainder.search(/\bFlight\s+[A-Z]{2}\s?\d{2,4}\b/iu);
  const end =
    nextFlightOffset >= 0
      ? afterFlight + nextFlightOffset
      : Math.min(lineAwareText.length, afterFlight + 720);
  return lineAwareText.slice(start, end);
}

function extractFlightLegsFromRegex(lineAwareText: string, sharedFields: CandidateMap): CandidateMap[] {
  if (!FLIGHT_CONTEXT_RE.test(lineAwareText)) return [];
  const legs: CandidateMap[] = [];
  const seen = new Set<string>();

  for (const match of lineAwareText.matchAll(/\b(?:Flight\s+)?([A-Z]{2})\s?(\d{2,4})\b/giu)) {
    const code = match[1]?.toUpperCase() ?? "";
    const num = match[2] ?? "";
    if (COUNTRY_CODE_DENYLIST.has(code)) continue;
    const flightNumber = `${code}${num}`;
    if (seen.has(flightNumber)) continue;
    seen.add(flightNumber);

    const idx = match.index ?? 0;
    const tokenLength = match[0]?.length ?? flightNumber.length;
    const window = extractFlightLegWindow(lineAwareText, idx, tokenLength);
    const { dep, arr } = extractAirportsFromWindow(window);
    const localTimeResult = extractBestLocalTimeCandidate(window, "flight");
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

  const hasFlightContext = FLIGHT_CONTEXT_RE.test(combined);

  const flightNumberMatch = hasFlightContext ? combined.match(/\b([A-Z]{2})\s?(\d{2,4})\b/u) : null;
  if (flightNumberMatch && !COUNTRY_CODE_DENYLIST.has(flightNumberMatch[1] ?? "")) {
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
  } else {
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

  const hotelNameMatch = combined.match(/(?:hotel|property|stay at|accommodation)\s*[:\-]?\s*([A-Z][A-Za-z0-9 '&.-]{2,60})/iu);
  if (hotelNameMatch?.[1]) {
    const hotelName = normalizeWhitespace(hotelNameMatch[1]);
    if (hotelName) {
      candidates.type = candidates.type ?? { value: "hotel", confidence: 0.8, source: "regex" };
      candidates.title = candidates.title ?? {
        value: hotelName,
        confidence: 0.78,
        source: "regex",
      };
      if (!candidates.provider) {
        candidates.provider = {
          value: hotelName.split(" ").slice(0, 2).join(" "),
          confidence: 0.6,
          source: "regex",
        };
      }
    }
  }

  // Handle "Confirmation #\n49932361" where newline separates # from code
  const confirmationMatch = combined.match(
    /(?:confirmation(?:\s*(?:number|code|#|receipt))?|booking\s*(?:ref(?:erence)?|code|#|number)|record locator|pnr|itinerary\s*(?:number|#)?|reservation\s*(?:number|#)?)[^A-Za-z0-9]{0,30}([A-Za-z0-9-]{4,20})/iu,
  );
  // Denylist common English words that regex may incorrectly grab as confirmation codes
  const CONFIRMATION_CODE_WORD_DENYLIST = new Set(["RECEIPT", "CODE", "NUMBER", "DETAILS", "PENDING", "CONFIRMED", "RESERVED", "BOOKING", "TRAVEL", "FLIGHT", "HOTEL", "TICKET", "MANAGE", "VIEW"]);
  const isValidConfirmationCode = confirmationMatch?.[1] && !CONFIRMATION_CODE_WORD_DENYLIST.has(confirmationMatch[1].toUpperCase());
  if (isValidConfirmationCode) {
    candidates.confirmationCode = {
      value: normalizeConfirmationCode(confirmationMatch![1]!),
      confidence: 0.92,
      source: "regex",
    };
  } else {
    const fallbackConfirmationMatch = combined.match(/\b([A-Z0-9]{5,12})\b/u);
    if (fallbackConfirmationMatch?.[1]) {
      candidates.confirmationCode = {
        value: normalizeConfirmationCode(fallbackConfirmationMatch[1]),
        confidence: 0.56,
        source: "regex",
      };
    }
  }

  const reservationType = normalizeType(candidates.type?.value ?? "") ?? undefined;
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

  const timezone = resolveTimezone(combined);
  if (timezone) {
    candidates.timezone = {
      value: timezone,
      confidence: timezone === "Etc/UTC" ? 0.45 : 0.8,
      source: "regex",
    };
  }

  if (!candidates.provider) {
    const providerFromSender = formatProviderFromSender(from);
    if (providerFromSender) {
      candidates.provider = {
        value: providerFromSender,
        confidence: 0.7,
        source: "regex",
      };
    }
  }

  if (!candidates.title) {
    const normalizedSubject = normalizeWhitespace(subject);
    if (normalizedSubject) {
      candidates.title = {
        value: normalizedSubject,
        confidence: 0.72,
        source: "regex",
      };
    }
  }

  return candidates;
}

async function runAiFallback(rawEmailText: string, subject = ""): Promise<CandidateMap[]> {
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
  const aiPrompt = [
    "Extract every travel reservation found in this email.",
    "Return strict JSON only with this shape:",
    '{ "reservations": [ { "type": "", "title": "", "provider": "", "confirmationCode": "", "localTime": "", "checkOutDate": "", "timezone": "", "location": "", "notes": "", "flightNumber": "", "departureAirport": "", "arrivalAirport": "" } ] }',
    "IMPORTANT: This may be a multi-leg itinerary. Scan for EVERY individual flight segment. For example HND→HNL→SEA→ONT has 3 flights — return 3 separate objects in reservations[]. Each object must have its own flightNumber, departureAirport, arrivalAirport, and localTime (departure time for that specific leg).",
    "Use type values only: flight, hotel, train, ride.",
    "CRITICAL for localTime: For flights, use the scheduled DEPARTURE time (not email send time, not boarding time, not purchase/booking/transaction date). Ignore 'Date:' and 'Sent:' lines from forward headers. For hotels, use the check-in date and time if stated, otherwise just the check-in date at 15:00 local time. NEVER guess or infer a year — if the year is not explicitly in the email use the current year only if the date is clearly in the future, otherwise leave localTime empty.",
    "For hotels, set checkOutDate to the check-out date in YYYY-MM-DD format. The email may use formats like 'Friday, 29-May-2026' or 'May 29, 2026' — convert to YYYY-MM-DD e.g. 2026-05-29. Also set localTime to the check-in date and time e.g. '2026-05-24 15:00'. For flights, leave checkOutDate empty.",
    "The departure time is the scheduled time the plane leaves the gate. Format: 'YYYY-MM-DD HH:mm' in 24-hour.",
    "For flights, set flightNumber to IATA airline code + flight number. If the email says 'Alaska Airlines Flight 832' write AS832. If it says 'Hawaiian Airlines Flight 12' write HA12. Common IATA codes: AS=Alaska Airlines, HA=Hawaiian Airlines, UA=United Airlines, AA=American Airlines, DL=Delta, WN=Southwest, B6=JetBlue, KE=Korean Air, NH=ANA, JL=JAL. NEVER use just the number alone — always prefix with the 2-letter IATA code. Never use credit card numbers like VI3557.",
    "For flights, set departureAirport to the IATA code of the origin airport and arrivalAirport to the IATA code of the destination. These are always in the email.",
    "For timezone: use the IATA timezone of the DEPARTURE airport city e.g. Pacific/Honolulu, America/New_York, Asia/Tokyo.",
    "For location: set to the departure airport name or city, NOT the hotel address.",
    "If any field is not explicitly stated in the email, return empty string. NEVER invent or guess dates, codes, or any other field.",
    "Do not include explanation text.",
    "",
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
        "You extract travel reservations from forwarded emails. Return ONLY a JSON object with a reservations array. CRITICAL RULES:\n(1) For FLIGHTS: scan the entire email for every individual flight segment. A 3-leg itinerary like HND→HNL→SEA→ONT has 3 separate flights — return 3 objects. NEVER merge segments into one. Each segment has its own flight number, departure airport, arrival airport, and departure time.\n(2) type=flight ONLY when a flight number or airline is present. type=hotel for hotels even if they mention arrival/departure dates.\n(3) localTime = scheduled DEPARTURE time of that specific flight leg in YYYY-MM-DD HH:mm 24-hour format. Never use email send time, purchase date, booking date, transaction date, or forward-header Date/Sent metadata.\n(4) flightNumber = 2-letter IATA code + flight number. If email says 'Alaska Airlines Flight 832' write AS832. If 'Hawaiian Airlines Flight 12' write HA12. Key codes: AS=Alaska, HA=Hawaiian, UA=United, AA=American, DL=Delta, KE=Korean Air, NH=ANA, JL=JAL, AZ=ITA Airways, FR=Ryanair, U2=easyJet, W4=Wizz Air. NEVER return number alone. VI3557 is a credit card, NOT a flight number.\n(5) departureAirport = IATA code of origin. arrivalAirport = IATA code of destination. Both must be set for every flight. Bari=BRI, Venice=VCE.\n(6) timezone = IANA timezone of the departure city e.g. Asia/Tokyo, Pacific/Honolulu, America/Los_Angeles, Europe/Rome.\n(7) location = departure city or airport name.\n(8) If a field is not in the email, use empty string. Never guess or invent values.",
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
    notes: notesSections.join(" "),
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
    if (!(draft[field] ?? "").trim()) {
      missing.add(field);
    }
  }
  return [...missing];
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

function dedupeDrafts(drafts: ForwardedReservationDraft[]): ForwardedReservationDraft[] {
  const seen = new Set<string>();
  const output: ForwardedReservationDraft[] = [];
  for (const draft of drafts) {
    const key = draftIdentityKey(draft);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(draft);
  }
  return output;
}

function chooseBodyText(text: string, html: string): { parsedText: string; lineAwareText: string; imageBasedEmail: boolean } {
  const lineAwareRaw = text.replace(/\r\n/g, "\n");
  const normalizedText = normalizeWhitespace(text);
  if (normalizedText.length >= MIN_READABLE_TEXT_LENGTH) {
    return { parsedText: normalizedText, lineAwareText: lineAwareRaw, imageBasedEmail: false };
  }
  const strippedHtml = stripHtml(html);
  if (strippedHtml.length >= MIN_READABLE_TEXT_LENGTH) {
    return { parsedText: strippedHtml, lineAwareText: strippedHtml, imageBasedEmail: false };
  }
  return {
    parsedText: strippedHtml || normalizedText,
    lineAwareText: lineAwareRaw || strippedHtml,
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
  if (/segment\s+\d|flight\s+\d\s+of\s+\d|\d\s+stop|\bconnecting\b|\blayover\b/iu.test(text)) return true;
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
  const likelyFlightEmail = /\bflight\b|\boarding\b|\bairport\b|\bdeparture\b|\barrival\b/iu.test(parsedText);
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
    aiCandidates = await runAiFallback(lineAwareText, subject);
    if (aiCandidates.length > 0) {
      usedAiFallback = true;
      candidates = sanitizeTravelLocalTime(
        mergeCandidates(candidates, aiCandidates[0] ?? {}),
        lineAwareText,
      );
      score = scoreCandidates(candidates);
      parserNotes.push("Applied AI fallback extraction for low-confidence fields.");
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
  if (aiCandidates.length > 1) {
    allCandidateMaps = aiCandidates.map((candidate) => {
      const reservationType = normalizeType(candidate.type?.value ?? "");
      if (reservationType === "flight") {
        return sanitizeTravelLocalTime(
          enrichFlightCandidate(applySharedFields(candidate, regexCandidates)),
          lineAwareText,
        );
      }
      return sanitizeTravelLocalTime(mergeCandidates(regexCandidates, candidate), lineAwareText);
    });
  } else if (aiCandidates.length === 1) {
    const primary = sanitizeTravelLocalTime(mergeCandidates(regexCandidates, aiCandidates[0]), lineAwareText);
    if (multiFlightDetected) {
      const regexLegs = extractFlightLegsFromRegex(lineAwareText, regexCandidates);
      allCandidateMaps = regexLegs.length > 1 ? regexLegs : [primary];
    } else {
      allCandidateMaps = [primary];
    }
  } else if (multiFlightDetected) {
    const regexLegs = extractFlightLegsFromRegex(lineAwareText, regexCandidates);
    allCandidateMaps =
      regexLegs.length > 1
        ? regexLegs
        : [sanitizeTravelLocalTime(regexCandidates, lineAwareText)];
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
  };
}

