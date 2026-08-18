/**
 * United / MileagePlus-style award totals: "24,000 miles + 195.80 USD"
 */

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

function parseIntegerWithSeparators(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  if (!cleaned) return undefined;
  if (/^\d{1,3}(?:,\d{3})+$/u.test(cleaned)) {
    const value = Number(cleaned.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || value > 50_000_000) return undefined;
    return Math.round(value);
  }
  const normalized = cleaned.replace(/\./g, "").replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 50_000_000) return undefined;
  return Math.round(value);
}

function parseUsdCents(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let cleaned = raw.trim();
  if (!cleaned) return undefined;
  if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/u.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (/^\d+,\d{2}$/u.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 500_000) return undefined;
  return Math.round(value * 100) / 100;
}

export interface AwardMilesPlusCashTotal {
  milesSpent: number;
  cashUsd: number;
  /** True when the line is "Total Per Passenger" (not the trip grand total). */
  perPassenger: boolean;
}

const AWARD_MILES_PLUS_CASH_LINE =
  /\b(?:grand\s+total|total(?:\s+per\s+passenger)?)\b[^0-9]{0,48}([0-9][0-9,\.]*)\s*miles?\s*\+\s*([0-9][0-9,\.]*)\s*(?:USD|US\$|US\s*dollars?)\b/giu;

/** Parse award bookings that show miles and cash taxes on one total line. */
export function parseAwardMilesPlusCashFromText(text: string): AwardMilesPlusCashTotal | undefined {
  const haystack = normalizeEmailText(text);
  if (!haystack) return undefined;

  let best: (AwardMilesPlusCashTotal & { score: number }) | undefined;

  for (const match of haystack.matchAll(AWARD_MILES_PLUS_CASH_LINE)) {
    const miles = parseIntegerWithSeparators(match[1]);
    const cashUsd = parseUsdCents(match[2]);
    if (miles == null || cashUsd == null) continue;

    const line = match[0].toLowerCase();
    let score = 60;
    if (line.includes("per passenger")) score -= 25;
    else if (line.startsWith("total ") || line.includes(" grand total")) score += 35;

    if (
      !best ||
      score > best.score ||
      (score === best.score && miles > best.milesSpent)
    ) {
      best = {
        milesSpent: miles,
        cashUsd,
        perPassenger: line.includes("per passenger"),
        score,
      };
    }
  }

  if (!best) return undefined;
  const { score: _score, ...result } = best;
  return result;
}
