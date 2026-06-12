import type { DuffelStayQuote } from "@/lib/providers/duffel/types";

/**
 * Genome-aware stay ranking — the "it already knows you" layer.
 *
 * Pure function: live hotel quotes + the traveler's hotel chain priority
 * (from their genome) → ranked stays with a human "why" line. A Hyatt
 * loyalist sees Hyatts first without ever saying the word; everyone still
 * sees honest quality/value ranking underneath the preference.
 */

export interface RankedStay {
  quote: DuffelStayQuote;
  fitScore: number;
  /** Which genome chain matched, e.g. "Hyatt" — null when no match. */
  chainMatch: string | null;
  kepiPick: boolean;
  whyLine: string;
}

function matchChain(quote: DuffelStayQuote, chainPriority: string[]): { name: string; index: number } | null {
  const haystacks = [quote.chainName ?? "", quote.name].map((value) => value.toLowerCase());
  for (let index = 0; index < chainPriority.length; index++) {
    const needle = chainPriority[index].toLowerCase().trim();
    if (!needle) continue;
    if (haystacks.some((hay) => hay.includes(needle))) {
      return { name: chainPriority[index], index };
    }
  }
  return null;
}

export function rankStays(quotes: DuffelStayQuote[], chainPriority: string[]): RankedStay[] {
  if (quotes.length === 0) return [];

  const nightlies = quotes.map((quote) => quote.nightlyUsd).filter((value) => value > 0);
  const minNightly = Math.min(...nightlies);
  const maxNightly = Math.max(...nightlies);
  const nightlySpread = Math.max(1, maxNightly - minNightly);

  const ranked: RankedStay[] = quotes.map((quote) => {
    const chain = matchChain(quote, chainPriority);
    // Quality: review score (0–10) weighs more than stars (1–5)
    const quality = (quote.reviewScore ?? 6.5) * 6 + (quote.ratingStars ?? 3) * 4;
    // Value: cheapest nightly in set scores 20, priciest 0
    const value = 20 * (1 - (quote.nightlyUsd - minNightly) / nightlySpread);
    // Loyalty: first chain in the genome list earns the biggest boost
    const loyalty = chain ? (chainPriority.length - chain.index) * 12 : 0;
    const fitScore = Math.round(quality + value + loyalty);

    const rating =
      quote.reviewScore !== undefined
        ? `${quote.reviewScore.toFixed(1)} rated`
        : quote.ratingStars !== undefined
        ? `${quote.ratingStars}★`
        : "unrated";
    const whyLine = chain
      ? `Your ${chain.name} — ${rating}, $${Math.round(quote.nightlyUsd)}/night`
      : quote.nightlyUsd === minNightly
      ? `Best value — ${rating}, $${Math.round(quote.nightlyUsd)}/night`
      : `${rating} · $${Math.round(quote.nightlyUsd)}/night`;

    return { quote, fitScore, chainMatch: chain?.name ?? null, kepiPick: false, whyLine };
  });

  ranked.sort((a, b) => b.fitScore - a.fitScore);
  if (ranked[0]) ranked[0] = { ...ranked[0], kepiPick: true };
  return ranked;
}
