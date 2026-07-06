import type { LoungeEligibilityResult, TravelerCredentials } from "./types";
import { getBenefitPlaybook } from "@/lib/points/benefitPlaybooks";

interface LoungeRule {
  loungeId: string;
  name: string;
  airportIata: string;
  nodeId: string;
  terminalHint?: string;
  airlines?: string[];
  cards?: string[];
  memberships?: string[];
  guestPolicy?: string;
  playbookId?: string;
  lastVerified: string;
}

const LOUNGE_RULES: LoungeRule[] = [
  {
    loungeId: "sea-centurion",
    name: "Centurion Lounge",
    airportIata: "SEA",
    nodeId: "lounge-centurion",
    terminalHint: "Central Terminal mezzanine",
    cards: ["Amex Platinum", "Amex Centurion"],
    guestPolicy: "Platinum: 2 guests on many visits when flying eligible ticket",
    playbookId: "amex-centurion-lounge",
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "sea-admirals",
    name: "Admirals Club",
    airportIata: "SEA",
    nodeId: "lounge-admirals",
    airlines: ["American"],
    cards: ["Citi AAdvantage Executive"],
    memberships: ["admirals_club"],
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "sea-united-club",
    name: "United Club",
    airportIata: "SEA",
    nodeId: "lounge-united",
    airlines: ["United"],
    memberships: ["united_club", "priority_pass"],
    playbookId: "amex-priority-pass",
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "sea-delta-sky",
    name: "Delta Sky Club",
    airportIata: "SEA",
    nodeId: "lounge-delta",
    airlines: ["Delta"],
    cards: ["Amex Platinum"],
    memberships: ["sky_club"],
    playbookId: "delta-sky-club-amex",
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "fco-plaza-premium",
    name: "Plaza Premium Lounge",
    airportIata: "FCO",
    nodeId: "lounge-pp-fco",
    terminalHint: "Terminal 3 — check Priority Pass app for exact location",
    cards: ["Amex Platinum"],
    memberships: ["priority_pass"],
    playbookId: "amex-priority-pass",
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "fco-ita-executive",
    name: "ITA Airways Executive Lounge",
    airportIata: "FCO",
    nodeId: "lounge-ita-fco",
    terminalHint: "Terminal 1 — ITA / SkyTeam elite",
    airlines: ["ITA", "Alitalia"],
    memberships: ["sky_club"],
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "muc-atlantic-lounge",
    name: "Atlantic Lounge",
    airportIata: "MUC",
    nodeId: "lounge-pp-muc",
    terminalHint: "Terminal 2 — Priority Pass partner",
    cards: ["Amex Platinum"],
    memberships: ["priority_pass"],
    playbookId: "amex-priority-pass",
    lastVerified: "2026-06-01",
  },
  {
    loungeId: "ont-no-centurion",
    name: "Airline lounges (no Centurion at ONT)",
    airportIata: "ONT",
    nodeId: "lounge-info-ont",
    terminalHint: "Small airport — use Priority Pass partners if listed in app",
    cards: ["Amex Platinum"],
    memberships: ["priority_pass"],
    playbookId: "amex-priority-pass",
    lastVerified: "2026-06-01",
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

    const normalizedAirline = airline?.trim().toLowerCase() ?? "";
    if (
      normalizedAirline &&
      rule.airlines?.some(
        (entry) =>
          normalizedAirline.includes(entry.toLowerCase()) ||
          entry.toLowerCase().includes(normalizedAirline),
      )
    ) {
      eligible = true;
      via = `${airline} ticket or status`;
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

    const playbook = rule.playbookId ? getBenefitPlaybook(rule.playbookId) : null;

    return {
      loungeId: rule.loungeId,
      eligible,
      via,
      reason,
      guestPolicy: rule.guestPolicy ?? playbook?.guestPolicy,
      rankScore: eligible ? 100 : 0,
      lastVerified: rule.lastVerified,
      loungeName: rule.name,
      terminalHint: rule.terminalHint,
      playbookId: rule.playbookId,
      entryMethod: playbook?.entryMethod,
      entrySteps: playbook?.steps,
      deepLink: playbook?.deepLink,
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
