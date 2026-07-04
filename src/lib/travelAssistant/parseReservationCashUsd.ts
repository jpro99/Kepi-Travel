/**
 * Extract cash totals from confirmation email text / reservation notes.
 * Handles exchange/reissue emails where "Total due" is $0 but ticket value is listed.
 */

import { parseMilesFromText } from "@/lib/travelAssistant/parseReservationMiles";

const TOTAL_CONTEXT =
  /\b(?:grand\s+total|total\s+(?:amount|price|cost|paid|charge|due|fare|for\s+trip|purchase\s+price)|amount\s+(?:paid|charged|due)|you\s+paid|price\s+paid|ticket\s+total|trip\s+total|booking\s+total|reservation\s+total|payment\s+total|purchase\s+total|charged\s+today|credit\s+card\s+charge|total\s+charges\s+for\s+air\s+travel)\b/iu;

const TICKET_VALUE_CONTEXT =
  /\b(?:new\s+ticket\s+value|ticket\s+value|original\s+ticket\s+value|fare\s+amount|airfare(?:\s+charges)?|summary\s+of\s+airfare)\b/iu;

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
  /\b(?:new\s+ticket\s+value|ticket\s+value|original\s+ticket\s+value|total\s+fare)\b[^$\d]{0,24}\$?\s*([\d,]+(?:\.\d{2})?)/giu;

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

function parseDollarAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 500_000) return undefined;
  return Math.round(value * 100) / 100;
}

/** Parse cash amounts from raw API/scan fields (numbers, "$499", "499usd", etc.). */
export function parseCashUsdFromUnknown(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
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
  return Math.round(value);
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

interface ScoredAmount {
  usd: number;
  score: number;
}

function scoreAmountMatch(fullText: string, start: number, end: number): number {
  const windowStart = Math.max(0, start - 90);
  const windowEnd = Math.min(fullText.length, end + 90);
  const context = fullText.slice(windowStart, windowEnd);
  let score = 10;
  if (TICKET_VALUE_CONTEXT.test(context)) score += 140;
  if (TOTAL_CONTEXT.test(context)) score += 100;
  if (ZERO_DUE_CONTEXT.test(context)) score -= 150;
  if (PENALTY_CONTEXT.test(context) && !TICKET_VALUE_CONTEXT.test(context)) score -= 60;
  if (/\b(?:miles?|points?)\b/iu.test(context) && !TICKET_VALUE_CONTEXT.test(context)) score -= 40;
  if (/\bUSD\b/u.test(context)) score += 5;
  if (/\$\s*[\d,]+(?:\.\d{2})?\s*(?:USD)?/u.test(context)) score += 3;
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
  const total = amounts.reduce((sum, value) => sum + value, 0);
  return Math.round(total);
}

/** Parse the best-effort total cash amount from confirmation email text. */
export function parseCashUsdFromText(text: string): number | undefined {
  const haystack = normalizeEmailText(text);
  if (!haystack) return undefined;

  if (isZeroCashDueContext(haystack) && isAwardOnlyReservationText(haystack)) {
    return undefined;
  }

  const ticketValueTotal = sumTicketValuesFromText(haystack);
  if (ticketValueTotal != null && ticketValueTotal > 0) {
    return ticketValueTotal;
  }

  const scored: ScoredAmount[] = [];

  const patterns: RegExp[] = [
    /\b(?:grand\s+total|total(?:\s+(?:amount|price|cost|paid|charge|due|fare))?|amount\s+(?:paid|charged|due)|you\s+paid|purchase\s+total|ticket\s+total|trip\s+total|payment\s+total|room\s+total|stay\s+total|reservation\s+total)\b[^$\d]{0,24}\$?\s*([\d,]+(?:\.\d{2})?)/giu,
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
      scored.push({ usd, score: scoreAmountMatch(haystack, start, end) });
    }
  }

  if (scored.length === 0) return undefined;

  scored.sort((a, b) => b.score - a.score || b.usd - a.usd);
  const best = scored[0];
  if (best.score >= 40) return Math.round(best.usd);

  const viable = scored.filter((entry) => entry.score >= 0 && entry.usd >= 20);
  if (viable.length > 0) {
    const top = viable.sort((a, b) => b.usd - a.usd)[0];
    if (top && top.score >= 0) return Math.round(top.usd);
  }

  if (best.score < 0) return undefined;
  return Math.round(best.usd);
}

export interface CashUsdResolvable {
  quotedPriceUsd?: number;
  notes?: string;
  originalEmailText?: string;
}

export function resolveReservationCashUsd(reservation: CashUsdResolvable): number | undefined {
  if (
    typeof reservation.quotedPriceUsd === "number" &&
    Number.isFinite(reservation.quotedPriceUsd) &&
    reservation.quotedPriceUsd > 0
  ) {
    return Math.round(reservation.quotedPriceUsd);
  }

  const combined = [reservation.notes, reservation.originalEmailText].filter(Boolean).join("\n");
  const miles = parseMilesFromText(combined);
  if (miles.milesSpent != null && isZeroCashDueContext(combined)) {
    return undefined;
  }
  if (isZeroCashDueContext(combined) && isAwardOnlyReservationText(combined)) {
    return undefined;
  }
  const parsed = parseCashUsdFromText(combined);
  return parsed != null ? Math.round(parsed) : undefined;
}
