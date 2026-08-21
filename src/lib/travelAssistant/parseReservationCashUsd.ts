/**
 * Extract cash totals from confirmation email text / reservation notes.
 * Handles exchange/reissue emails where "Total due" is $0 but ticket value is listed.
 */

import { parseMilesFromText } from "@/lib/travelAssistant/parseReservationMiles";
import { parseAwardMilesPlusCashFromText } from "@/lib/travelAssistant/parseAwardMilesPlusCash";
import { selectPricingSourceText } from "@/lib/travelAssistant/pricingSourceText";
import { extractPdfAttachmentSection } from "@/lib/travelAssistant/emailSourceText";

const TOTAL_CONTEXT =
  /\b(?:grand\s+total|total\s+(?:amount|price|cost|paid|charge|due|fare|for\s+trip|purchase\s+price)|amount\s+(?:paid|charged|due)|you\s+paid|you\s+will\s+be\s+charged|will\s+be\s+charged\s+a\s+total|charged\s+a\s+total|price\s+paid|ticket\s+total|trip\s+total|booking\s+total|reservation\s+total|payment\s+total|purchase\s+total|room\s+total|stay\s+total|charged\s+today|credit\s+card\s+charge|total\s+charges\s+for\s+air\s+travel|total\s+balance\s+due)\b/iu;

// PDF text extraction often collapses spaces ("NewTicketValue:$1,386.43").
const TICKET_VALUE_CONTEXT =
  /\b(?:new\s*ticket\s*value|ticket\s*value|original\s*ticket\s*value|fare\s*amount|airfare(?:\s*charges)?|summary\s*of\s*airfare)\b/iu;

const AWARD_ONLY_CONTEXT =
  /\b(?:award\s+(?:travel|ticket|redemption|booking)|mileage\s+plan\s+(?:award|redemption)|redeem(?:ed|ing)?\s+(?:with\s+)?(?:miles?|points?)|points?\s+(?:only|redemption|award))\b/iu;

const ZERO_CASH_DUE_CONTEXT =
  /\b(?:additional\s+amount\s+due|amount\s+due|per\s+person\s+total|total\s+(?:amount|charges|paid|due)|you\s+paid|charged\s+today)[^$\d]{0,20}\$?\s*0(?:\.00)?\b/iu;

const ZERO_DUE_CONTEXT =
  /\b(?:additional\s+amount\s+due|amount\s+due|per\s+person\s+total|total\s+charges\s+for\s+air\s+travel)\b[^$\d]{0,16}\$?\s*0(?:\.00)?\b/iu;

function isZeroCashDueContext(text: string): boolean {
  const haystack = normalizeEmailText(text);
  return ZERO_CASH_DUE_CONTEXT.test(haystack) || ZERO_DUE_CONTEXT.test(haystack);
}

export function isAwardOnlyReservationText(text: string): boolean {
  const haystack = normalizeEmailText(text);
  if (!haystack) return false;
  return AWARD_ONLY_CONTEXT.test(haystack) || /\b(?:miles?|points?)\s+(?:redeem(?:ed|ing)?|used|spent|applied)\b/iu.test(haystack);
}

const PENALTY_CONTEXT =
  /\b(?:per\s+night|\/\s*night|nightly|tax(?:es)?|fee(?:s)?|surcharge|gratuity|tip|deposit|balance\s+due|estimated|approx|award|\/\s*pax|each)\b/iu;

const TICKET_VALUE_LINE =
  /\b(?:new\s*ticket\s*value|ticket\s*value|original\s*ticket\s*value|total\s*fare)\b[^$\d]{0,160}\$?\s*([\d,]+(?:\.\d{2})?)/giu;

function normalizeEmailText(text: string): string {
  return text
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#36;|&dollar;/giu, "$")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Approximate EUR→USD for European airline tax/fare lines in trip spend totals. */
const EUR_TO_USD = 1.08;

function parseMoneyToken(raw: string): number | undefined {
  let cleaned = raw.trim();
  if (!cleaned) return undefined;
  // US thousands: 12,000 or 1,386.43
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{2})?$/u.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/u.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d{2}$/u.test(cleaned) && !/,\d{3}/u.test(cleaned)) {
    // European decimal (86,40) — not US thousands (12,000)
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 500_000) return undefined;
  return Math.round(value * 100) / 100;
}

function parseDollarAmount(raw: string): number | undefined {
  return parseMoneyToken(raw);
}

function parseEuroAmount(raw: string): number | undefined {
  const eur = parseMoneyToken(raw);
  if (eur == null) return undefined;
  return Math.round(eur * EUR_TO_USD);
}

/** Parse cash amounts from raw API/scan fields (numbers, "$499", "499usd", etc.). */
export function parseCashUsdFromUnknown(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return clampParsedBookingCash(Math.round(raw));
  }
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const fromText = parseCashUsdFromText(trimmed);
  if (fromText != null) return fromText;
  const digitsOnly = trimmed.replace(/[^0-9.]/g, "");
  if (!digitsOnly) return undefined;
  const value = Number(digitsOnly);
  if (!Number.isFinite(value) || value <= 0 || value > 500_000) return undefined;
  return clampParsedBookingCash(Math.round(value));
}

/** Prefer a price near a confirmation code or property name within a longer document. */
export function parseCashUsdNearBooking(
  text: string,
  hints: { confirmationCode?: string; title?: string },
): number | undefined {
  const haystack = normalizeEmailText(text);
  if (!haystack) return undefined;

  const tryWindow = (start: number, end: number): number | undefined => {
    const slice = haystack.slice(Math.max(0, start), Math.min(haystack.length, end));
    return parseCashUsdFromText(slice);
  };

  const code = hints.confirmationCode?.trim();
  if (code && code.length >= 4) {
    const idx = haystack.toLowerCase().indexOf(code.toLowerCase());
    if (idx >= 0) {
      const near = tryWindow(idx - 500, idx + 900);
      if (near != null) return near;
    }
  }

  const title = hints.title?.trim();
  if (title && title.length >= 4) {
    const probe = title.slice(0, Math.min(title.length, 40));
    const idx = haystack.toLowerCase().indexOf(probe.toLowerCase());
    if (idx >= 0) {
      const near = tryWindow(idx - 250, idx + 700);
      if (near != null) return near;
    }
  }

  return parseCashUsdFromText(haystack);
}

/** Slice of a long confirmation document most likely to contain this booking's pricing. */
export function extractNearBookingText(
  text: string,
  hints: {
    confirmationCode?: string;
    title?: string;
    flightNumber?: string;
    departureAirport?: string;
    arrivalAirport?: string;
  },
): string | undefined {
  const haystack = text.trim();
  if (!haystack) return undefined;

  const sliceWindow = (start: number, end: number): string | undefined => {
    const slice = haystack.slice(Math.max(0, start), Math.min(haystack.length, end)).trim();
    return slice.length >= 40 ? slice : undefined;
  };

  const dep = hints.departureAirport?.trim().toUpperCase();
  const arr = hints.arrivalAirport?.trim().toUpperCase();
  if (dep && arr && dep.length === 3 && arr.length === 3) {
    const haystackUpper = haystack.toUpperCase();
    const routeNeedles = [`${dep} - ${arr}`, `${dep}-${arr}`, `${dep} / ${arr}`, `${dep} TO ${arr}`, `${dep} ${arr}`];
    for (const needle of routeNeedles) {
      const idx = haystackUpper.indexOf(needle);
      if (idx >= 0) {
        const tail = haystack.slice(idx + needle.length, idx + needle.length + 160);
        const nextLeg = tail.search(/\b(?:leg\s+[a-z0-9]+|segment\s+\d|passenger\s+\d)\b/iu);
        const sliceEnd =
          nextLeg > 20 ? idx + needle.length + nextLeg : idx + needle.length + Math.min(tail.length, 90);
        const slice = sliceWindow(idx - 40, sliceEnd);
        if (slice) return slice;
      }
    }
  }

  const code = hints.confirmationCode?.trim();
  if (code && code.length >= 4) {
    const idx = haystack.toLowerCase().indexOf(code.toLowerCase());
    if (idx >= 0) {
      const slice = sliceWindow(idx - 200, idx + 1100);
      if (slice) return slice;
    }
  }

  const flightNumber = hints.flightNumber?.trim().replace(/\s+/gu, "");
  if (flightNumber && flightNumber.length >= 3) {
    const idx = haystack.toUpperCase().indexOf(flightNumber.toUpperCase());
    if (idx >= 0) {
      const slice = sliceWindow(idx - 250, idx + 650);
      if (slice) return slice;
    }
  }

  const title = hints.title?.trim();
  if (title && title.length >= 6) {
    const probe = title.slice(0, Math.min(title.length, 48));
    const idx = haystack.toLowerCase().indexOf(probe.toLowerCase());
    if (idx >= 0) {
      const slice = sliceWindow(idx - 200, idx + 550);
      if (slice) return slice;
    }
  }

  return undefined;
}

/** Max credible cash for one booking parsed from email (taxes/fees on awards, not fare). */
export const MAX_SINGLE_BOOKING_CASH_USD = 15_000;

function isMilesQuantityMatch(haystack: string, end: number): boolean {
  const after = haystack.slice(end, end + 24);
  return /^\s*(?:miles?|points?|pts)\b/iu.test(after);
}

function clampParsedBookingCash(usd: number, _score = 0): number | undefined {
  if (!Number.isFinite(usd) || usd <= 0) return undefined;
  const rounded = Math.round(usd);
  // Never let "Total 24,000 miles" become a $24,000 fare via a high context score.
  if (rounded > MAX_SINGLE_BOOKING_CASH_USD) return undefined;
  return rounded;
}

/** True when stored/parsed cash is actually a miles quantity (e.g. 24,000 mi → $24,000). */
export function isMilesQuantityMisreadAsCash(cashUsd: number, milesSpent?: number): boolean {
  const cash = Math.round(cashUsd);
  if (!Number.isFinite(cash) || cash <= 0) return false;
  if (milesSpent == null || !Number.isFinite(milesSpent) || milesSpent <= 0) return false;
  const miles = Math.round(milesSpent);
  if (cash === miles) return true;
  // Per-passenger award line (12,000) stored as cash when trip total is 24,000.
  if (miles >= 10_000 && miles % 2 === 0 && cash === miles / 2) return true;
  return false;
}

export function isImplausibleSingleBookingCash(cashUsd: number): boolean {
  return Number.isFinite(cashUsd) && cashUsd > MAX_SINGLE_BOOKING_CASH_USD;
}

/** "Total  1,386.43 USD" — a bare Total label right before the amount is a real total. */
function hasBareTotalLabelBefore(fullText: string, start: number): boolean {
  const lead = fullText.slice(Math.max(0, start - 24), start);
  return /\b(?:total|totale|amount)\b[^0-9A-Za-z]{0,8}$/iu.test(lead);
}

function scoreAmountMatch(fullText: string, start: number, end: number): number {
  const windowStart = Math.max(0, start - 90);
  const windowEnd = Math.min(fullText.length, end + 90);
  const context = fullText.slice(windowStart, windowEnd);
  let score = 10;
  const isTicketValue = TICKET_VALUE_CONTEXT.test(context);
  const isStrongTotal = TOTAL_CONTEXT.test(context) || hasBareTotalLabelBefore(fullText, start);
  if (isTicketValue) score += 140;
  if (isStrongTotal) score += 100;
  if (ZERO_DUE_CONTEXT.test(context)) score -= 150;
  // Airbnb/Booking often put "per night" near "charged a total" — never let nightly kill a strong total (I42).
  if (PENALTY_CONTEXT.test(context) && !isTicketValue && !isStrongTotal) score -= 60;
  if (/\b(?:miles?|points?)\b/iu.test(context) && !isTicketValue && !isStrongTotal) score -= 200;
  if (/\bUSD\b/u.test(context)) score += 5;
  if (/\b(?:EUR|€)\b/u.test(context)) score += 4;
  if (/\$\s*[\d,]+(?:\.\d{2})?\s*(?:USD)?/u.test(context)) score += 3;
  return score;
}

interface ScoredEuroAmount {
  usd: number;
  score: number;
}

function scoreEuroAmountMatch(fullText: string, start: number, end: number): number {
  const windowStart = Math.max(0, start - 90);
  const windowEnd = Math.min(fullText.length, end + 90);
  const context = fullText.slice(windowStart, windowEnd);
  let score = 8;
  if (TOTAL_CONTEXT.test(context)) score += 100;
  if (/\b(?:totale|importo\s+totale|total\s+amount|amount\s+paid|taxes?\s+and\s+fees?|fare\s+details|payment\s+details)\b/iu.test(context)) {
    score += 80;
  }
  if (PENALTY_CONTEXT.test(context) && !TOTAL_CONTEXT.test(context)) score -= 50;
  if (/\b(?:miles?|points?|punti|volare)\b/iu.test(context)) score -= 20;
  return score;
}

/** Sum all "New Ticket Value" lines (multi-passenger Alaska-style receipts). */
function sumTicketValuesFromText(haystack: string): number | undefined {
  const amounts: number[] = [];
  for (const match of haystack.matchAll(TICKET_VALUE_LINE)) {
    const raw = match[1];
    if (!raw) continue;
    const usd = parseDollarAmount(raw);
    if (usd != null) amounts.push(usd);
  }
  if (amounts.length === 0) return undefined;
  const uniqueAmounts = [...new Set(amounts)];
  const passengerBlocks = haystack.match(/\bpassenger\s+\d+\b/gi);
  const multiPassengerReceipt = (passengerBlocks?.length ?? 0) > 1;
  // Forwarded threads repeat the same ticket value per leg — one PNR, one fare.
  if (uniqueAmounts.length === 1 && !multiPassengerReceipt) {
    return Math.round(uniqueAmounts[0]!);
  }
  // Forwarded threads can repeat dozens of ticket values — never sum into six figures.
  if (amounts.length > 8) {
    return Math.round(Math.max(...amounts));
  }
  const total = amounts.reduce((sum, value) => sum + value, 0);
  if (total > MAX_SINGLE_BOOKING_CASH_USD) {
    return Math.round(Math.max(...amounts));
  }
  return Math.round(total);
}

/** Parse cash from normalized email/PDF text (no PDF-section lift). */
function parseCashUsdFromNormalizedHaystack(
  haystack: string,
  options?: { skipAward?: boolean },
): number | undefined {
  if (!haystack) return undefined;

  if (!options?.skipAward) {
    const awardTotal = parseAwardMilesPlusCashFromText(haystack);
    if (awardTotal != null) {
      return clampParsedBookingCash(awardTotal.cashUsd, 120);
    }
  }

  // Only suppress a ticket value when miles were actually redeemed — loyalty
  // branding alone ("Award travel", "Atmos Rewards Member") is not payment.
  if (isZeroCashDueContext(haystack) && isAwardOnlyReservationText(haystack)) {
    const milesActuallySpent = parseMilesFromText(haystack).milesSpent;
    if (milesActuallySpent != null && milesActuallySpent > 0) {
      return undefined;
    }
  }

  const ticketValueTotal = sumTicketValuesFromText(haystack);
  if (ticketValueTotal != null && ticketValueTotal > 0) {
    const clamped = clampParsedBookingCash(ticketValueTotal, 140);
    if (clamped != null) return clamped;
  }

  interface ScoredAmount {
    usd: number;
    score: number;
  }

  const scored: ScoredAmount[] = [];
  const scoredEur: ScoredEuroAmount[] = [];

  const eurPatterns: RegExp[] = [
    /\bTotal\s+Amount\b[^€\d]{0,16}(?:€|EUR)\s*([\d.,]+)/giu,
    /\b(?:grand\s+total|total(?:\s+(?:amount|price|cost|paid|charge|due|fare))?|amount\s+(?:paid|charged|due)|totale|importo\s+totale|you\s+paid|ticket\s+total|payment\s+total|fare)\b[^€\d]{0,24}(?:€|EUR)\s*([\d.,]+)/giu,
    /(?:€|EUR)\s*([\d.,]+)(?:\s*(?:EUR|€))?/giu,
    /\b([\d.,]+)\s*(?:EUR|€)\b/giu,
  ];

  for (const pattern of eurPatterns) {
    for (const match of haystack.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const usd = parseEuroAmount(raw);
      if (usd == null) continue;
      const start = match.index ?? 0;
      const end = start + match[0].length;
      scoredEur.push({ usd, score: scoreEuroAmountMatch(haystack, start, end) });
    }
  }

  const patterns: RegExp[] = [
    /\b(?:grand\s+total|total(?:\s+(?:amount|price|cost|paid|charge|due|fare|balance))?|amount\s+(?:paid|charged|due)|you\s+paid|you\s+will\s+be\s+charged(?:\s+a\s+total)?|charged\s+a\s+total|will\s+be\s+charged\s+a\s+total|purchase\s+total|ticket\s+total|trip\s+total|payment\s+total|room\s+total|stay\s+total|reservation\s+total)\b[^$\d]{0,40}\$?\s*([\d,]+(?:\.\d{2})?)/giu,
    /\b(?:USD|US\$)\s*([\d,]+(?:\.\d{2})?)/giu,
    /\$\s*([\d,]+(?:\.\d{2})?)(?:\s*(?:USD|US\$|usd))?/giu,
    /\b([\d,]+(?:\.\d{2})?)\s*(?:USD|US\$|US\s*dollars?)\b/giu,
    /\b([\d,]+(?:\.\d{2})?)(?:usd|us\$)(?![a-z])/giu,
    /(?:^|[^\d])([\d,]+(?:\.\d{2})?)(?:usd|us\$)(?![a-z])/giu,
  ];

  for (const pattern of patterns) {
    for (const match of haystack.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const usd = parseDollarAmount(raw);
      if (usd == null) continue;
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isMilesQuantityMatch(haystack, end)) continue;
      scored.push({ usd, score: scoreAmountMatch(haystack, start, end) });
    }
  }

  if (scored.length === 0 && scoredEur.length === 0) return undefined;

  scored.sort((a, b) => b.score - a.score || b.usd - a.usd);
  scoredEur.sort((a, b) => b.score - a.score || b.usd - a.usd);

  const bestUsd = scored[0];
  const bestEur = scoredEur[0];

  if (bestUsd && bestUsd.score >= 40) {
    const clamped = clampParsedBookingCash(bestUsd.usd, bestUsd.score);
    if (clamped != null) return clamped;
  }
  if (bestEur && bestEur.score >= 40) {
    const clamped = clampParsedBookingCash(bestEur.usd, bestEur.score);
    if (clamped != null) return clamped;
  }

  return undefined;
}

/** Parse the best-effort total cash amount from confirmation email text. */
export function parseCashUsdFromText(text: string): number | undefined {
  const haystack = normalizeEmailText(text);
  if (!haystack) return undefined;

  const awardTotal = parseAwardMilesPlusCashFromText(haystack);
  if (awardTotal != null) {
    return clampParsedBookingCash(awardTotal.cashUsd, 120);
  }

  const pdfSection = extractPdfAttachmentSection(text);
  if (pdfSection) {
    const fromPdf = parseCashUsdFromNormalizedHaystack(normalizeEmailText(pdfSection), {
      skipAward: true,
    });
    if (fromPdf != null) return fromPdf;
  }

  return parseCashUsdFromNormalizedHaystack(haystack, { skipAward: true });
}

export interface CashUsdResolvable {
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  notes?: string;
  originalEmailText?: string;
  confirmationCode?: string;
  title?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

function milesHintForCashGuard(reservation: CashUsdResolvable, pricingText?: string): number | undefined {
  if (
    typeof reservation.quotedPointsMiles === "number" &&
    Number.isFinite(reservation.quotedPointsMiles) &&
    reservation.quotedPointsMiles > 0
  ) {
    return Math.round(reservation.quotedPointsMiles);
  }
  if (pricingText) {
    const award = parseAwardMilesPlusCashFromText(pricingText);
    if (award?.milesSpent) return award.milesSpent;
    const miles = parseMilesFromText(pricingText);
    if (miles.milesSpent != null) return miles.milesSpent;
  }
  return undefined;
}

function sanitizeResolvedCashUsd(
  cashUsd: number | undefined,
  milesSpent?: number,
): number | undefined {
  if (cashUsd == null || cashUsd <= 0) return undefined;
  const rounded = Math.round(cashUsd);
  if (isImplausibleSingleBookingCash(rounded)) return undefined;
  if (isMilesQuantityMisreadAsCash(rounded, milesSpent)) return undefined;
  return rounded;
}

function pricingTextForReservation(reservation: CashUsdResolvable): string {
  return selectPricingSourceText(reservation);
}

function storedQuotedCashUsd(reservation: CashUsdResolvable, pricingText?: string): number | undefined {
  if (
    typeof reservation.quotedPriceUsd !== "number" ||
    !Number.isFinite(reservation.quotedPriceUsd) ||
    reservation.quotedPriceUsd <= 0
  ) {
    return undefined;
  }
  return sanitizeResolvedCashUsd(
    reservation.quotedPriceUsd,
    milesHintForCashGuard(reservation, pricingText),
  );
}

export function resolveReservationCashUsd(reservation: CashUsdResolvable): number | undefined {
  const hasSourceText = Boolean(
    reservation.originalEmailText?.trim() || reservation.notes?.trim(),
  );

  if (hasSourceText) {
    const pricingText = pricingTextForReservation(reservation);
    const miles = parseMilesFromText(pricingText);
    // G43: award + $0 due is an active no-cash decision — do not resurrect ticket value stored as cash.
    if (miles.milesSpent != null && isZeroCashDueContext(pricingText)) {
      return undefined;
    }
    if (
      isZeroCashDueContext(pricingText) &&
      isAwardOnlyReservationText(pricingText) &&
      miles.milesSpent != null &&
      miles.milesSpent > 0
    ) {
      return undefined;
    }
    let parsed = parseCashUsdFromText(pricingText);
    if (parsed == null) {
      const full = [reservation.notes, reservation.originalEmailText].filter(Boolean).join("\n");
      if (full && full !== pricingText) {
        parsed = parseCashUsdFromText(full);
      }
    }
    if (parsed != null && parsed > 0) {
      return sanitizeResolvedCashUsd(parsed, milesHintForCashGuard(reservation, pricingText));
    }
    // G45: itinerary notes/email with no fare must not ignore a plausible typed/stored amount.
    // G33: junk six-figure stored cash still dies in sanitizeResolvedCashUsd.
    return storedQuotedCashUsd(reservation, pricingText);
  }

  return storedQuotedCashUsd(reservation);
}
