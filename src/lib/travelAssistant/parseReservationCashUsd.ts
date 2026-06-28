/**
 * Extract cash totals from confirmation email text / reservation notes.
 * Prefer explicit "total" lines over incidental dollar amounts (tax, per-night, etc.).
 */

const TOTAL_CONTEXT =
  /\b(?:grand\s+total|total\s+(?:amount|price|cost|paid|charge|due|fare|for\s+trip|purchase\s+price)|amount\s+(?:paid|charged|due)|you\s+paid|price\s+paid|ticket\s+total|trip\s+total|booking\s+total|reservation\s+total|payment\s+total|purchase\s+total|charged\s+today|credit\s+card\s+charge)\b/iu;

const PENALTY_CONTEXT =
  /\b(?:per\s+night|\/\s*night|nightly|tax(?:es)?|fee(?:s)?|surcharge|gratuity|tip|deposit|balance\s+due|estimated|approx|points|miles|award|per\s+person|\/\s*pax|each)\b/iu;

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

interface ScoredAmount {
  usd: number;
  score: number;
}

function scoreAmountMatch(fullText: string, start: number, end: number, usd: number): number {
  const windowStart = Math.max(0, start - 80);
  const windowEnd = Math.min(fullText.length, end + 80);
  const context = fullText.slice(windowStart, windowEnd);
  let score = 10;
  if (TOTAL_CONTEXT.test(context)) score += 100;
  if (PENALTY_CONTEXT.test(context)) score -= 60;
  if (/\bUSD\b/u.test(context)) score += 5;
  if (/\$\s*[\d,]+(?:\.\d{2})?\s*(?:USD)?/u.test(context)) score += 3;
  return score;
}

/** Parse the best-effort total cash amount from confirmation email text. */
export function parseCashUsdFromText(text: string): number | undefined {
  const haystack = normalizeEmailText(text);
  if (!haystack) return undefined;

  const scored: ScoredAmount[] = [];

  const patterns: RegExp[] = [
    /\b(?:grand\s+total|total(?:\s+(?:amount|price|cost|paid|charge|due|fare))?|amount\s+(?:paid|charged|due)|you\s+paid|purchase\s+total|ticket\s+total|trip\s+total|payment\s+total)\b[^$\d]{0,24}\$?\s*([\d,]+(?:\.\d{2})?)/giu,
    /\b(?:USD|US\$)\s*([\d,]+(?:\.\d{2})?)/giu,
    /\$\s*([\d,]+(?:\.\d{2})?)(?:\s*USD)?/giu,
    /\b([\d,]+(?:\.\d{2})?)\s*(?:USD|US\s*dollars?)\b/giu,
  ];

  for (const pattern of patterns) {
    for (const match of haystack.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const usd = parseDollarAmount(raw);
      if (usd == null) continue;
      const start = match.index ?? 0;
      const end = start + match[0].length;
      scored.push({ usd, score: scoreAmountMatch(haystack, start, end, usd) });
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
  const parsed = parseCashUsdFromText(combined);
  return parsed != null ? Math.round(parsed) : undefined;
}
