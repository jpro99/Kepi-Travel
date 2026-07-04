// src/lib/flights/scoring.ts
// Composite scorer. Replaces the naive "sort by cash-equivalent" with a weighted
// 0..100 score so a $5-cheaper red-eye with two stops doesn't outrank a nonstop.
//
// Sub-scores (each 0..1):
//   value        - cheaper effective cost is better (dominant factor)
//   convenience  - fewer stops + shorter duration
//   reachability - can the user actually book it? (cash always; award depends)
//   quality      - penalties for surcharge-heavy awards / unknown data
//
// Weights are intentionally explicit and easy to tune.

import type {
  FusedOffer,
  FusedSearchParams,
  OfferMetrics,
  AnyOffer,
} from "./types";

export const SCORE_WEIGHTS = {
  value: 0.5,
  convenience: 0.25,
  reachability: 0.15,
  quality: 0.1,
} as const;

export function deriveMetrics(offer: AnyOffer): OfferMetrics {
  const segments = offer.segments ?? [];
  const stops = Math.max(0, segments.length - 1);

  let durationMinutes: number | null = null;
  if (segments.length > 0) {
    const start = Date.parse(segments[0].departingAt);
    const end = Date.parse(segments[segments.length - 1].arrivingAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      durationMinutes = Math.round((end - start) / 60000);
    }
  }
  return { stops, durationMinutes };
}

// Lower cash-equivalent => higher value score, scaled against the cheapest in set.
function valueScore(cashEquivalent: number, cheapest: number): number {
  if (cheapest <= 0 || cashEquivalent <= 0) return 0;
  return clamp01(cheapest / cashEquivalent);
}

// Fewer stops and shorter duration => higher. Unknown duration => neutral 0.5.
function convenienceScore(
  metrics: OfferMetrics,
  shortestDuration: number | null
): number {
  const stopPenalty = Math.min(metrics.stops * 0.25, 0.75);
  let durationComponent = 0.5;
  if (
    metrics.durationMinutes !== null &&
    shortestDuration !== null &&
    metrics.durationMinutes > 0
  ) {
    durationComponent = clamp01(shortestDuration / metrics.durationMinutes);
  }
  // Blend: stops matter, duration matters slightly less.
  return clamp01(0.6 * (1 - stopPenalty) + 0.4 * durationComponent);
}

function reachabilityScore(offer: FusedOffer, hasUser: boolean): number {
  if (offer.offer.kind === "cash") return 1; // always bookable
  if (!hasUser) return 0.8; // unknown balances — don't over-penalize
  if (offer.reachable) return 1;
  // Not reachable: partial credit if a transfer gets close.
  const closest = offer.reachableVia?.[0];
  if (closest && closest.shortfall !== undefined) {
    const need = offer.offer.milesCost || 1;
    return clamp01(0.5 * (1 - closest.shortfall / (need + closest.shortfall)));
  }
  return 0.15;
}

function qualityScore(offer: FusedOffer): number {
  let score = 1;
  if (offer.offer.kind === "award") {
    if (offer.offer.surchargeHeavy) score -= 0.25;
    if (offer.metrics?.durationMinutes === null) score -= 0.1; // stub data
  }
  return clamp01(score);
}

// Scores every offer in place and returns them sorted best-first.
export function scoreAndRank(
  offers: FusedOffer[],
  params: FusedSearchParams
): FusedOffer[] {
  if (offers.length === 0) return offers;

  // Ensure metrics exist.
  for (const o of offers) {
    if (!o.metrics) o.metrics = deriveMetrics(o.offer);
  }

  const cheapest = Math.min(...offers.map((o) => o.cashEquivalent));
  const durations = offers
    .map((o) => o.metrics?.durationMinutes)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const shortestDuration = durations.length ? Math.min(...durations) : null;
  const hasUser = Boolean(params.userId);

  for (const o of offers) {
    const value = valueScore(o.cashEquivalent, cheapest);
    const convenience = convenienceScore(
      o.metrics as OfferMetrics,
      shortestDuration
    );
    const reachability = reachabilityScore(o, hasUser);
    const quality = qualityScore(o);

    const composite =
      SCORE_WEIGHTS.value * value +
      SCORE_WEIGHTS.convenience * convenience +
      SCORE_WEIGHTS.reachability * reachability +
      SCORE_WEIGHTS.quality * quality;

    o.scoreBreakdown = {
      value: round2(value),
      convenience: round2(convenience),
      reachability: round2(reachability),
      quality: round2(quality),
      composite: Math.round(composite * 100),
    };
    o.score = o.scoreBreakdown.composite;
  }

  const ranked = [...offers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  ranked.forEach((o, i) => (o.isBestValue = i === 0));
  return ranked;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}
