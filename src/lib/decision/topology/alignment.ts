import { resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import type { PricedTopology } from "@/lib/decision/topology/types";

export function buildAlignmentFromPricedTopology(topology: PricedTopology): AlignmentLeg[] {
  const legs: AlignmentLeg[] = [];
  let step = 1;

  for (const row of topology.legs) {
    const leg = row.leg;
    const isAward = leg.pricing === "award_estimate";
    const book =
      !isAward && row.offerId
        ? resolveCashBookUrl({
            origin: leg.fromIata,
            destination: leg.toIata,
            departureDate: leg.departureDate,
            airline: row.airline,
            offerId: row.offerId,
            quotedPriceUsd: row.amountUsd,
            flightNumber: row.flightNumber,
          })
        : null;

    legs.push({
      id: leg.id,
      step: step++,
      role:
        leg.role === "return"
          ? "return"
          : leg.role === "connector"
            ? "connector"
            : leg.role === "feeder"
              ? "connector"
              : isAward
                ? "award"
                : "outbound",
      label: `${leg.fromIata} → ${leg.toIata}`,
      detail: row.airline
        ? `${row.airline} · Kepi Wave Search`
        : isAward
          ? `~${row.awardMiles?.toLocaleString() ?? "?"} miles · estimated award`
          : leg.fromLabel + " → " + leg.toLabel,
      status: row.priced && row.offerId ? "verified" : isAward ? "estimated" : "modeled",
      statusLabel:
        row.priced && row.offerId
          ? "Live price verified"
          : isAward
            ? "Award estimate — verify before booking"
            : "Modeled — confirm fare",
      priceUsd: row.amountUsd,
      originIata: leg.fromIata,
      destinationIata: leg.toIata,
      departureDate: leg.departureDate,
      airline: row.airline,
      bookUrl: book?.url,
      bookLabel: book?.label,
      verifyUrl: isAward
        ? buildSeatsAeroSearchUrl({
            origin: leg.fromIata,
            destination: leg.toIata,
            departureDate: leg.departureDate,
          })
        : undefined,
    });
  }

  for (const ground of topology.groundLegs) {
    legs.push({
      id: ground.id,
      step: step++,
      role: "ground",
      label: ground.label,
      detail: ground.detail,
      status: "recommended_skip",
      statusLabel: "Train or drive — skip the short flight",
      priceUsd: ground.costUsd,
    });
  }

  return legs;
}
