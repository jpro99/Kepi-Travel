/**
 * Extract miles/points spent and earned from confirmation emails.
 */

import {
  resolveReservationCashUsd,
  extractNearBookingText,
  type CashUsdResolvable,
} from "@/lib/travelAssistant/parseReservationCashUsd";

function normalizeEmailText(text: string): string {
  return text
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseMilesNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.replace(/\./g, "").replace(/,/g, "").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 50_000_000) return undefined;
  return Math.round(value);
}

const PROGRAM_HINTS: Array<{ pattern: RegExp; program: string }> = [
  { pattern: /\bvolare\b/iu, program: "Volare" },
  { pattern: /\b(?:ita\s+airways|ita\s+volare)\b/iu, program: "Volare" },
  { pattern: /\batmos\s+rewards\b/iu, program: "Atmos Rewards" },
  { pattern: /\balaska\s+mileage\s+plan\b/iu, program: "Alaska Mileage Plan" },
  { pattern: /\bmileage\s+plan\b/iu, program: "Alaska Mileage Plan" },
  { pattern: /\bmileageplus\b/iu, program: "United MileagePlus" },
  { pattern: /\bsky\s*miles\b/iu, program: "Delta SkyMiles" },
  { pattern: /\baadvantage\b/iu, program: "American AAdvantage" },
  { pattern: /\brapid\s+rewards\b/iu, program: "Southwest Rapid Rewards" },
  { pattern: /\btrue\s*blue\b/iu, program: "JetBlue TrueBlue" },
  { pattern: /\bavios\b/iu, program: "Avios" },
  { pattern: /\bflying\s+blue\b/iu, program: "Flying Blue" },
];

const SPENT_PATTERNS: RegExp[] = [
  /\b(?:punti\s+volare|volare\s+punti)\s*(?:utilizzat[oi]?|usati|spesi)[:\-]?\s*([0-9,\.]+)\b/giu,
  /\b(?:redeem(?:ed)?|used|spent|deducted|applied|utilizzat[oi]?|spes[oi])\s*[:\-]?\s*([0-9,\.]+)\s*(?:volare\s*)?(?:miles?|points?|punti)\b/giu,
  /\b([0-9,\.]+)\s*(?:volare\s*)?(?:miles?|points?|punti)\s*(?:redeem(?:ed)?|used|spent|deducted|applied|utilizzat[oi]?|spes[oi])\b/giu,
  /\b(?:miles?|points?|punti)\s*(?:redeem(?:ed)?|used|spent|deducted|utilizzat[oi]?)[:\-]?\s*([0-9,\.]+)\b/giu,
  /\b(?:award\s+(?:travel|ticket|redemption))[^0-9]{0,24}([0-9,\.]+)\s*(?:miles?|points?|punti)\b/giu,
  /\b(?:redemption|redeemed|biglietto\s+award)[:\s]+([0-9,\.]+)\s*(?:miles?|points?|punti)\b/giu,
  /\b([0-9,\.]+)\s*(?:miles?|points?|punti)\s*(?:\+|\s)?(?:taxes?|fees?|surcharge|tasse)\b/giu,
  /\b(?:cash\s*&\s*points|cash\s+and\s+points)[^0-9]{0,40}([0-9,\.]+)\s*(?:miles?|points?|punti)\b/giu,
];

const EARNED_PATTERNS: RegExp[] = [
  /\b(?:earn(?:ed|ing)?|credit(?:ed)?|awarded|accrued|bonus)\s*[:\-]?\s*([0-9,]+)\s*(?:bonus\s+)?(?:miles?|points?)\b/giu,
  /\b([0-9,]+)\s*(?:bonus\s+)?(?:miles?|points?)\s*(?:earn(?:ed|ing)?|credit(?:ed)?|awarded|accrued)\b/giu,
  /\b(?:miles?|points?)\s*(?:earn(?:ed|ing)?|credit(?:ed)?|awarded)[:\-]?\s*([0-9,]+)\b/giu,
  /\b(?:you\s+(?:will|have|'ll)\s+earn)\s*[:\-]?\s*([0-9,]+)\s*(?:bonus\s+)?(?:miles?|points?)\b/giu,
];

export interface ParsedMilesFromText {
  milesSpent?: number;
  milesEarned?: number;
  program?: string;
}

export function parseMilesFromText(text: string): ParsedMilesFromText {
  const haystack = normalizeEmailText(text);
  if (!haystack) return {};

  let milesSpent: number | undefined;
  for (const pattern of SPENT_PATTERNS) {
    for (const match of haystack.matchAll(pattern)) {
      const parsed = parseMilesNumber(match[1]);
      if (parsed != null) {
        milesSpent = milesSpent == null ? parsed : Math.max(milesSpent, parsed);
      }
    }
  }

  let milesEarned: number | undefined;
  for (const pattern of EARNED_PATTERNS) {
    for (const match of haystack.matchAll(pattern)) {
      const parsed = parseMilesNumber(match[1]);
      if (parsed != null) {
        milesEarned = milesEarned == null ? parsed : Math.max(milesEarned, parsed);
      }
    }
  }

  let program: string | undefined;
  for (const hint of PROGRAM_HINTS) {
    if (hint.pattern.test(haystack)) {
      program = hint.program;
      break;
    }
  }

  return {
    ...(milesSpent != null ? { milesSpent } : {}),
    ...(milesEarned != null ? { milesEarned } : {}),
    ...(program ? { program } : {}),
  };
}

export interface MilesResolvable {
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
  notes?: string;
  originalEmailText?: string;
}

export function resolveReservationMiles(reservation: MilesResolvable): ParsedMilesFromText {
  const result: ParsedMilesFromText = {};

  if (
    typeof reservation.quotedPointsMiles === "number" &&
    Number.isFinite(reservation.quotedPointsMiles) &&
    reservation.quotedPointsMiles > 0
  ) {
    result.milesSpent = Math.round(reservation.quotedPointsMiles);
  }
  if (
    typeof reservation.quotedMilesEarned === "number" &&
    Number.isFinite(reservation.quotedMilesEarned) &&
    reservation.quotedMilesEarned > 0
  ) {
    result.milesEarned = Math.round(reservation.quotedMilesEarned);
  }
  if (reservation.pointsProgram?.trim()) {
    result.program = reservation.pointsProgram.trim();
  }

  const combined = [reservation.notes, reservation.originalEmailText].filter(Boolean).join("\n");
  const parsed = parseMilesFromText(combined);

  if (result.milesSpent == null && parsed.milesSpent != null) result.milesSpent = parsed.milesSpent;
  if (result.milesEarned == null && parsed.milesEarned != null) result.milesEarned = parsed.milesEarned;
  if (!result.program && parsed.program) result.program = parsed.program;

  return result;
}

export interface ReservationPricing extends ParsedMilesFromText {
  cashUsd?: number;
}

export function resolveReservationPricing(
  reservation: CashUsdResolvable & MilesResolvable,
): ReservationPricing {
  const cashUsd = resolveReservationCashUsd(reservation);
  const miles = resolveReservationMiles(reservation);
  return {
    ...(cashUsd != null ? { cashUsd } : {}),
    ...miles,
  };
}

export interface PricingNearBookingInput extends CashUsdResolvable, MilesResolvable {
  confirmationCode?: string;
  title?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

/** Resolve cash + miles from the slice of a confirmation most relevant to one booking. */
export function resolvePricingNearBooking(input: PricingNearBookingInput): ReservationPricing {
  const combined = [input.notes, input.originalEmailText].filter(Boolean).join("\n");
  const nearText = extractNearBookingText(combined, {
    confirmationCode: input.confirmationCode,
    title: input.title,
    flightNumber: input.flightNumber,
    departureAirport: input.departureAirport,
    arrivalAirport: input.arrivalAirport,
  });
  return resolveReservationPricing({
    ...input,
    originalEmailText: nearText ?? input.originalEmailText,
  });
}
