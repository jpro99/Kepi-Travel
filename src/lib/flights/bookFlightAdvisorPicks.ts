/**
 * Book-tab flight advisor: top personalized picks from fused search.
 * Honest handoff — quotes are comparison only (KEPI_DESIGN_LAW F14).
 */

import { resolveAirport } from "@/lib/airports/lookup";
import { SOCAL_LOCAL_AIRPORTS, resolveCashSearchOrigins } from "@/lib/flights/gatewaySearch";
import type { AlaskaUpgradeCandidate, FusedOffer, FusedSearchResult, OriginCashRow } from "@/lib/flights/types";

export type AdvisorPickKind = "overall" | "cash" | "miles" | "alaska";

export interface BookAdvisorPick {
  kind: AdvisorPickKind;
  title: string;
  reason: string;
  offer: FusedOffer | null;
  alaska?: AlaskaUpgradeCandidate;
  /** Display dollars for the quote line (not for the CTA). */
  quoteUsd: number | null;
  milesCost: number | null;
  programLabel: string | null;
  originIata: string;
  destinationIata: string;
  airlineLabel: string;
  stops: number;
  quoteDisclaimer: string;
  ctaLabel: string;
  ctaKind: "google" | "seats";
}

const PROGRAM_LABELS: Record<string, string> = {
  alaska: "Alaska",
  united: "United",
  american: "American",
  delta: "Delta",
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  avios_ba: "BA Avios",
  avios_iberia: "Iberia Avios",
  singapore_krisflyer: "Singapore",
  lifemiles: "LifeMiles",
};

/** Duffel sandbox / non-airline carriers must never appear as bookable airlines. */
export function isTestOrFakeCarrier(airlineName: string | undefined, iata?: string): boolean {
  const name = (airlineName ?? "").trim().toLowerCase();
  const code = (iata ?? "").trim().toUpperCase();
  if (!name && (code === "??" || code === "XX" || code === "ZZ")) return true;
  if (name.includes("duffel")) return true;
  if (code === "ZZ" || code === "XX") return true;
  return false;
}

export function airportCityLabel(iata: string): string {
  const code = iata.trim().toUpperCase();
  const resolved = resolveAirport(code);
  if (resolved?.city) {
    return resolved.city.split(",")[0]?.trim() || resolved.city;
  }
  return code;
}

/**
 * Requested origin first, then traveler genome airports, then SoCal neighbors (incl. PSP)
 * when the search is Southern California so we can surface “cheaper from Palm Springs.”
 */
export function resolveBookAdvisorOrigins(requestedOrigin: string, genomeIatas: string[]): string[] {
  const requested = requestedOrigin.trim().toUpperCase();
  const genome = genomeIatas.map((a) => a.trim().toUpperCase()).filter(Boolean);
  const soCalHint =
    SOCAL_LOCAL_AIRPORTS.has(requested) || genome.some((a) => SOCAL_LOCAL_AIRPORTS.has(a));
  const soCalExtras = soCalHint ? ["PSP", "ONT", "SNA", "LAX", "BUR"] : [];
  const merged = resolveCashSearchOrigins([requested, ...genome, ...soCalExtras]);
  if (!merged.includes(requested)) return [requested, ...merged].slice(0, 6);
  return [requested, ...merged.filter((a) => a !== requested)].slice(0, 6);
}

export function usdFromCashAmount(amount: number): number {
  // Fused cash offers store USD cents; origin leaderboard uses the same units.
  if (amount >= 1000) return Math.round(amount / 100);
  return Math.round(amount);
}

export function buildFlightQuoteDisclaimer(priceUsd: number): string {
  return `From ~$${Math.round(priceUsd).toLocaleString()} (search quote) — confirm on Google.`;
}

export function buildFlightCompareGoogleLabel(): string {
  return "Compare on Google Flights ↗";
}

export function buildFlightVerifyAwardLabel(program: string): string {
  const label = PROGRAM_LABELS[program] ?? program;
  return `Verify on Seats.aero · book ${label} ↗`;
}

function offerId(offer: FusedOffer): string {
  return offer.offer.id;
}

function airlineFromOffer(offer: FusedOffer): string {
  if (offer.offer.kind === "cash") {
    const name = offer.offer.airlineName?.trim();
    const iata = offer.offer.segments[0]?.marketingCarrier;
    if (isTestOrFakeCarrier(name, iata)) return iata || "Airline";
    return name || iata || "Airline";
  }
  return PROGRAM_LABELS[offer.offer.program] ?? offer.offer.program;
}

function filterRealOffers(offers: FusedOffer[]): FusedOffer[] {
  return offers.filter((row) => {
    if (row.offer.kind !== "cash") return true;
    return !isTestOrFakeCarrier(row.offer.airlineName, row.offer.segments[0]?.marketingCarrier);
  });
}

function nearbyCashReason(
  requestedOrigin: string,
  leaderboard: OriginCashRow[] | undefined,
): { best: OriginCashRow | null; reason: string | null; saveUsd: number | null } {
  if (!leaderboard?.length) return { best: null, reason: null, saveUsd: null };
  const requested = requestedOrigin.toUpperCase();
  const sorted = [...leaderboard].sort((a, b) => a.totalAmount - b.totalAmount);
  const best = sorted[0]!;
  const atRequested = sorted.find((r) => r.origin === requested);
  if (!atRequested || best.origin === requested) {
    return { best, reason: null, saveUsd: null };
  }
  const saveUsd = usdFromCashAmount(atRequested.totalAmount) - usdFromCashAmount(best.totalAmount);
  if (saveUsd < 1) return { best, reason: null, saveUsd: null };
  const reason = `$${saveUsd.toLocaleString()} less from ${airportCityLabel(best.origin)} (${best.origin}) than ${airportCityLabel(requested)}.`;
  return { best, reason, saveUsd };
}

function pickMiles(
  offers: FusedOffer[],
  preferAlaska: boolean,
  used: Set<string>,
): FusedOffer | null {
  const awards = offers.filter((o) => o.offer.kind === "award" && !used.has(offerId(o)));
  if (awards.length === 0) return null;
  if (preferAlaska) {
    const alaska = awards.find((o) => o.offer.kind === "award" && o.offer.program === "alaska");
    if (alaska) return alaska;
  }
  return awards[0] ?? null;
}

function toPick(input: {
  kind: AdvisorPickKind;
  title: string;
  reason: string;
  offer: FusedOffer;
  destinationFallback: string;
}): BookAdvisorPick {
  const { kind, title, reason, offer, destinationFallback } = input;
  const segs = offer.offer.segments;
  const origin = (offer.searchOrigin ?? segs[0]?.origin ?? "").toUpperCase();
  const destination = (segs[segs.length - 1]?.destination ?? destinationFallback).toUpperCase();
  const stops = offer.metrics?.stops ?? Math.max(0, segs.length - 1);

  if (offer.offer.kind === "award") {
    const miles = offer.offer.milesCost;
    const program = offer.offer.program;
    return {
      kind,
      title,
      reason,
      offer,
      quoteUsd: Math.round(offer.cashEquivalent / 100),
      milesCost: miles,
      programLabel: PROGRAM_LABELS[program] ?? program,
      originIata: origin,
      destinationIata: destination,
      airlineLabel: airlineFromOffer(offer),
      stops,
      quoteDisclaimer: `${miles.toLocaleString()} ${PROGRAM_LABELS[program] ?? program} mi (availability quote) — verify before booking.`,
      ctaLabel: buildFlightVerifyAwardLabel(program),
      ctaKind: "seats",
    };
  }

  const quoteUsd = usdFromCashAmount(offer.offer.totalAmount);
  return {
    kind,
    title,
    reason,
    offer,
    quoteUsd,
    milesCost: null,
    programLabel: null,
    originIata: origin,
    destinationIata: destination,
    airlineLabel: airlineFromOffer(offer),
    stops,
    quoteDisclaimer: buildFlightQuoteDisclaimer(quoteUsd),
    ctaLabel: buildFlightCompareGoogleLabel(),
    ctaKind: "google",
  };
}

/**
 * Build up to 4 advisor cards: overall, best cash, best miles, Alaska (when relevant).
 * Prefer distinct offers; never surface Duffel Airways / test carriers.
 */
export function buildBookAdvisorPicks(input: {
  result: FusedSearchResult;
  requestedOrigin: string;
  preferAlaska?: boolean;
}): BookAdvisorPick[] {
  const requestedOrigin = input.requestedOrigin.toUpperCase();
  const preferAlaska = Boolean(input.preferAlaska);
  const destination = input.result.params.destination.toUpperCase();
  const clean = filterRealOffers(input.result.offers ?? []);
  const used = new Set<string>();
  const picks: BookAdvisorPick[] = [];

  const overall = clean[0] ?? null;
  if (overall) {
    used.add(offerId(overall));
    const reason =
      overall.recommendationReason?.trim() ||
      (overall.offer.kind === "cash"
        ? `Best balance of price, stops, and fit for how you fly${preferAlaska ? " (Alaska-friendly ranking)" : ""}.`
        : overall.offer.kind === "award"
          ? `Strong miles value vs paying cash for this trip.`
          : "Top ranked option for this search.");
    picks.push(
      toPick({
        kind: "overall",
        title: "Best overall",
        reason,
        offer: overall,
        destinationFallback: destination,
      }),
    );
  }

  const nearby = nearbyCashReason(requestedOrigin, input.result.originCashLeaderboard);
  let bestCash =
    clean.find((o) => o.offer.kind === "cash" && !used.has(offerId(o))) ??
    clean.find((o) => o.offer.kind === "cash") ??
    null;

  // Prefer the leaderboard winner’s origin when it beats the requested airport.
  if (nearby.best) {
    const match = clean.find(
      (o) =>
        o.offer.kind === "cash" &&
        (o.searchOrigin ?? o.offer.segments[0]?.origin)?.toUpperCase() === nearby.best!.origin,
    );
    if (match) bestCash = match;
  } else if (input.result.cheapestCash && !isTestOrFakeCarrier(
    input.result.cheapestCash.offer.kind === "cash" ? input.result.cheapestCash.offer.airlineName : undefined,
    input.result.cheapestCash.offer.segments[0]?.marketingCarrier,
  )) {
    bestCash = input.result.cheapestCash;
  }

  if (bestCash) {
    used.add(offerId(bestCash));
    const origin = (bestCash.searchOrigin ?? bestCash.offer.segments[0]?.origin ?? "").toUpperCase();
    const reason =
      nearby.reason ??
      (origin && origin !== requestedOrigin
        ? `Cheapest sensible cash from ${airportCityLabel(origin)} (${origin}).`
        : `Lowest cash quote among real airlines for ${airportCityLabel(requestedOrigin)}.`);
    picks.push(
      toPick({
        kind: "cash",
        title: "Best cash",
        reason,
        offer: bestCash,
        destinationFallback: destination,
      }),
    );
  }

  // Miles card may repeat the overall winner when that winner is an award — different framing.
  const miles = pickMiles(clean, preferAlaska, new Set());
  if (miles) {
    const program = miles.offer.kind === "award" ? miles.offer.program : "";
    const reason =
      miles.recommendationReason?.trim() ||
      (preferAlaska && program === "alaska"
        ? "Best Alaska / Mileage Plan space for your balances."
        : "Best award space found for your programs.");
    picks.push(
      toPick({
        kind: "miles",
        title: "Best miles",
        reason,
        offer: miles,
        destinationFallback: destination,
      }),
    );
  }

  const alaska = input.result.alaskaUpgradeCandidates?.[0];
  if (alaska && preferAlaska) {
    picks.push({
      kind: "alaska",
      title: "Alaska / status play",
      reason: alaska.detail,
      offer: null,
      alaska,
      quoteUsd: alaska.cashUsd,
      milesCost: null,
      programLabel: "Alaska",
      originIata: alaska.origin.toUpperCase(),
      destinationIata: alaska.destination.toUpperCase(),
      airlineLabel: alaska.airline,
      stops: 0,
      quoteDisclaimer: buildFlightQuoteDisclaimer(alaska.cashUsd),
      ctaLabel: buildFlightCompareGoogleLabel(),
      ctaKind: "google",
    });
  }

  return picks;
}
