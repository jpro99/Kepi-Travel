/**
 * Extract miles/points spent and earned from confirmation emails.
 */

import {
  resolveReservationCashUsd,
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
  const value = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0 || value > 50_000_000) return undefined;
  return Math.round(value);
}

const PROGRAM_HINTS: Array<{ pattern: RegExp; program: string }> = [
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
  /\b(?:redeem(?:ed)?|used|spent|deducted|applied)\s*[:\-]?\s*([0-9,]+)\s*(?:miles?|points?)\b/giu,
  /\b([0-9,]+)\s*(?:miles?|points?)\s*(?:redeem(?:ed)?|used|spent|deducted|applied)\b/giu,
  /\b(?:miles?|points?)\s*(?:redeem(?:ed)?|used|spent|deducted)[:\-]?\s*([0-9,]+)\b/giu,
  /\b(?:award\s+(?:travel|ticket|redemption))[^0-9]{0,24}([0-9,]+)\s*(?:miles?|points?)\b/giu,
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
