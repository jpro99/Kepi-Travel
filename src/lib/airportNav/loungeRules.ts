import type { LoungeEligibilityResult, TravelerCredentials } from "./types";

interface LoungeRule {
  loungeId: string;
  name: string;
  airportIata: string;
  nodeId: string;
  airlines?: string[];
  cards?: string[];
  memberships?: string[];
  guestPolicy?: string;
  lastVerified: string;
}

const LOUNGE_RULES: LoungeRule[] = [
  {
    loungeId: "sea-centurion",
    name: "Centurion Lounge",
    airportIata: "SEA",
    nodeId: "lounge-centurion",
    cards: ["Amex Platinum", "Amex Centurion"],
    guestPolicy: "Platinum: 2 guests on same-day Delta ticket",
    lastVerified: "2026-03-01",
  },
  {
    loungeId: "sea-admirals",
    name: "Admirals Club",
    airportIata: "SEA",
    nodeId: "lounge-admirals",
    airlines: ["American"],
    cards: ["Citi AAdvantage Executive"],
    memberships: ["admirals_club"],
    lastVerified: "2026-03-01",
  },
  {
    loungeId: "sea-united-club",
    name: "United Club",
    airportIata: "SEA",
    nodeId: "lounge-united",
    airlines: ["United"],
    memberships: ["united_club", "priority_pass"],
    lastVerified: "2026-03-01",
  },
  {
    loungeId: "sea-delta-sky",
    name: "Delta Sky Club",
    airportIata: "SEA",
    nodeId: "lounge-delta",
    airlines: ["Delta"],
    cards: ["Amex Platinum"],
    memberships: ["sky_club"],
    lastVerified: "2026-03-01",
  },
];

function cardMatches(ruleCards: string[] | undefined, credentials: TravelerCredentials): string | null {
  if (!ruleCards || !credentials.paymentCards) return null;
  for (const card of credentials.paymentCards) {
    for (const rule of ruleCards) {
      if (card.product.toLowerCase().includes(rule.toLowerCase().split(" ")[0])) {
        return card.product;
      }
      if (rule.toLowerCase().includes(card.product.toLowerCase())) {
        return card.product;
      }
    }
  }
  return null;
}

export function evaluateLoungeEligibility(
  iata: string,
  credentials: TravelerCredentials,
  airline?: string,
): LoungeEligibilityResult[] {
  const rules = LOUNGE_RULES.filter(
    (rule) => rule.airportIata.toUpperCase() === iata.toUpperCase(),
  );

  return rules.map((rule) => {
    let eligible = false;
    let via: string | undefined;
    let reason: string | undefined;

    if (airline && rule.airlines?.some((entry) => entry.toLowerCase() === airline.toLowerCase())) {
      eligible = true;
      via = `${airline} ticket`;
    }

    const cardVia = cardMatches(rule.cards, credentials);
    if (cardVia) {
      eligible = true;
      via = cardVia;
    }

    if (
      rule.memberships?.some((membership) =>
        credentials.loungeMemberships?.includes(
          membership as NonNullable<TravelerCredentials["loungeMemberships"]>[number],
        ),
      )
    ) {
      eligible = true;
      via = via ?? "membership on file";
    }

    if (!eligible) {
      reason = rule.cards?.length
        ? `Requires ${rule.cards.join(" or ")}`
        : `Requires ${rule.airlines?.join("/") ?? "eligible status"}`;
    }

    return {
      loungeId: rule.loungeId,
      eligible,
      via,
      reason,
      guestPolicy: rule.guestPolicy,
      rankScore: eligible ? 100 : 0,
      lastVerified: rule.lastVerified,
    };
  });
}

export function loungeNodeId(loungeId: string): string | null {
  const rule = LOUNGE_RULES.find((entry) => entry.loungeId === loungeId);
  return rule?.nodeId ?? null;
}

export function listLoungesForAirport(iata: string): LoungeRule[] {
  return LOUNGE_RULES.filter((rule) => rule.airportIata.toUpperCase() === iata.toUpperCase());
}
