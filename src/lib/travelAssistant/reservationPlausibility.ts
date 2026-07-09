/**
 * Deterministic sanity checks for a parsed reservation, run *after* extraction and
 * *before* it is trusted as trip fact. These are not confidence heuristics — they are
 * hard, explainable rules ("SEA is not a valid airport pairing with SEA") that catch
 * confidently-wrong output regardless of parser confidence score.
 */

const IATA_CODE_RE = /^[A-Z]{3}$/;

export interface ReservationPlausibilityInput {
  type: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" */
  localTime: string;
  /** "YYYY-MM-DD", hotel checkout only */
  checkOutDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  quotedPriceUsd?: number;
  /** Injectable for tests; defaults to real current time. */
  now?: Date;
}

export interface ReservationPlausibilityResult {
  plausible: boolean;
  issues: string[];
}

function parseLocalDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/u);
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi] = match;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? "0"), Number(mi ?? "0")),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Runs cheap, explainable plausibility checks. Never throws. */
export function checkReservationPlausibility(
  input: ReservationPlausibilityInput,
): ReservationPlausibilityResult {
  const issues: string[] = [];
  const now = input.now ?? new Date();

  if (input.type === "flight") {
    const dep = (input.flightDepartureAirport ?? "").trim().toUpperCase();
    const arr = (input.flightArrivalAirport ?? "").trim().toUpperCase();
    if (dep && !IATA_CODE_RE.test(dep)) {
      issues.push(`Departure airport "${dep}" is not a valid 3-letter airport code.`);
    }
    if (arr && !IATA_CODE_RE.test(arr)) {
      issues.push(`Arrival airport "${arr}" is not a valid 3-letter airport code.`);
    }
    if (dep && arr && dep === arr) {
      issues.push(`Departure and arrival airport are both "${dep}".`);
    }
  }

  const localDate = parseLocalDate(input.localTime);
  if (input.localTime.trim() && !localDate) {
    issues.push(`Local time "${input.localTime}" is not a recognizable date.`);
  } else if (localDate) {
    const earliestSane = new Date(now);
    earliestSane.setFullYear(now.getFullYear() - 1);
    const latestSane = new Date(now);
    latestSane.setFullYear(now.getFullYear() + 3);
    if (localDate < earliestSane || localDate > latestSane) {
      issues.push(`Date ${input.localTime} falls outside the expected travel window.`);
    }
  }

  if (input.type === "hotel" && input.checkOutDate?.trim() && localDate) {
    const checkOut = parseLocalDate(input.checkOutDate);
    if (checkOut && checkOut.getTime() <= localDate.getTime()) {
      issues.push("Checkout date is not after check-in date.");
    }
  }

  if (
    typeof input.quotedPriceUsd === "number" &&
    (!Number.isFinite(input.quotedPriceUsd) || input.quotedPriceUsd < 0)
  ) {
    issues.push(`Price ${input.quotedPriceUsd} is not a valid amount.`);
  }

  return { plausible: issues.length === 0, issues };
}
