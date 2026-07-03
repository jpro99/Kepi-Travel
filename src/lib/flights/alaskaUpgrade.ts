import type { AlaskaUpgradeCandidate, CashOffer } from "./types";
import { resolveCashBookUrl } from "@/lib/decision/bookingLinks";

const ALASKA_AIRLINE_PATTERN = /alaska/i;

export function isAlaskaMetalOffer(airlineName: string | undefined): boolean {
  if (!airlineName) return false;
  return ALASKA_AIRLINE_PATTERN.test(airlineName);
}

export function buildAlaskaUpgradeCandidates(
  cashOffers: CashOffer[],
  instrumentLabel: string,
  departDate: string,
): AlaskaUpgradeCandidate[] {
  const seen = new Set<string>();
  const candidates: AlaskaUpgradeCandidate[] = [];

  for (const offer of cashOffers) {
    if (offer.cabin !== "economy" && offer.cabin !== "premium_economy") continue;
    const airline = offer.airlineName ?? offer.segments[0]?.marketingCarrier ?? "";
    if (!isAlaskaMetalOffer(airline)) continue;

    const origin = offer.segments[0]?.origin?.toUpperCase() ?? "";
    const destination = offer.segments[0]?.destination?.toUpperCase() ?? "";
    const key = `${origin}-${destination}-${offer.cabin}-${offer.totalAmount}`;
    if (!origin || !destination || seen.has(key)) continue;
    seen.add(key);

    const cashUsd = offer.totalAmount / 100;
    const book = resolveCashBookUrl({
      origin,
      destination,
      departureDate: departDate,
      airline,
      offerId: offer.id,
      quotedPriceUsd: cashUsd,
      flightNumber:
        offer.segments[0]?.flightNumber !== "—" ? offer.segments[0]?.flightNumber : undefined,
    });

    candidates.push({
      origin,
      destination,
      departureDate: departDate,
      cashUsd,
      airline,
      offerId: offer.id,
      cabin: offer.cabin,
      instrumentLabel,
      detail: `Book ${offer.cabin.replace("_", " ")} on Alaska metal, then apply your ${instrumentLabel} at check-in or in Manage Reservation.`,
      bookUrl: book.url,
      bookLabel: book.label,
    });
  }

  return candidates.sort((a, b) => a.cashUsd - b.cashUsd);
}
