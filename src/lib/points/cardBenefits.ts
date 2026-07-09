import { findCard } from "@/lib/points/cardEarnRules";

export interface CardAirportBenefits {
  centurionLounge?: boolean;
  priorityPass?: boolean;
  priorityCheckIn?: string;
  prioritySecurity?: boolean;
  loungeProductNames?: string[];
}

export interface CardStatusGrant {
  chain: string;
  tier: string;
  note?: string;
}

export interface CardAirlineGrant {
  airline: string;
  tier: string;
  note?: string;
}

export interface CardBenefitProfile {
  cardId: string;
  name: string;
  airport: CardAirportBenefits;
  hotelGrants: CardStatusGrant[];
  airlineGrants: CardAirlineGrant[];
  /** Shown in UI — credits to apply for, not automatic membership */
  trustedTravelerCredits: Array<"global_entry" | "tsa_precheck" | "clear">;
  guidance: string[];
}

/** Travel benefits by catalog card id — names only, never PAN. Update via kepi-card-bot skill. */
export const CARD_BENEFIT_PROFILES: Record<string, CardBenefitProfile> = {
  "amex-platinum": {
    cardId: "amex-platinum",
    name: "Amex Platinum",
    airport: {
      centurionLounge: true,
      priorityPass: true,
      priorityCheckIn: "Use the premium check-in counter or first class line when you paid with this card",
      prioritySecurity: false,
      loungeProductNames: ["Amex Platinum", "Amex Centurion"],
    },
    hotelGrants: [
      { chain: "Marriott", tier: "Gold Elite", note: "Enrollment required" },
      { chain: "Hilton", tier: "Gold", note: "Enrollment required" },
    ],
    airlineGrants: [],
    trustedTravelerCredits: ["global_entry", "clear"],
    guidance: [
      "Centurion Lounge access when flying same day (select airports)",
      "Priority Pass lounges — 2 guests on many visits",
      "Delta Sky Club when flying Delta same day",
      "Premium check-in line at many airlines when fare qualifies",
    ],
  },
  "chase-sapphire-preferred": {
    cardId: "chase-sapphire-preferred",
    name: "Chase Sapphire Preferred",
    airport: {},
    hotelGrants: [],
    airlineGrants: [],
    trustedTravelerCredits: ["global_entry", "tsa_precheck"],
    guidance: ["Trip delay/cancellation protection", "No lounge included — pair with airline status or another card"],
  },
  "hyatt-card": {
    cardId: "hyatt-card",
    name: "World of Hyatt Credit Card",
    airport: {},
    hotelGrants: [
      { chain: "Hyatt", tier: "Discoverist", note: "Automatic while card is open" },
    ],
    airlineGrants: [],
    trustedTravelerCredits: [],
    guidance: [
      "World of Hyatt Discoverist — use the World of Hyatt / elite check-in line",
      "Free night award each card anniversary",
      "Elite nights from spend count toward Globalist",
    ],
  },
  "alaska-card": {
    cardId: "alaska-card",
    name: "Alaska Airlines Visa",
    airport: {},
    hotelGrants: [],
    airlineGrants: [],
    trustedTravelerCredits: [],
    guidance: [
      "Companion fare each year — not airport lounge access by itself",
      "Pair with Mileage Plan status in Loyalty Wallet for lounge and priority lanes",
    ],
  },
  "chase-ink-business": {
    cardId: "chase-ink-business",
    name: "Chase Ink Business",
    airport: {},
    hotelGrants: [],
    airlineGrants: [],
    trustedTravelerCredits: [],
    guidance: ["Strong earn on office supply and telecom — no airport lounge benefit"],
  },
};

export function getCardBenefitProfile(cardId: string): CardBenefitProfile | null {
  return CARD_BENEFIT_PROFILES[cardId] ?? null;
}

export function listBenefitsForOwnedCards(ownedCardIds: string[]): CardBenefitProfile[] {
  return ownedCardIds
    .map((id) => getCardBenefitProfile(id))
    .filter((entry): entry is CardBenefitProfile => entry != null);
}

export function paymentCardsFromOwned(
  ownedCards: Array<{ cardId: string; label?: string; lastFour?: string }>,
): Array<{ id: string; product: string; network: string; lastFour?: string }> {
  return ownedCards.map((entry) => {
    const catalog = findCard(entry.cardId);
    const benefits = getCardBenefitProfile(entry.cardId);
    const name = entry.label?.trim() || catalog?.name || benefits?.name || entry.cardId;
    const issuer = catalog?.issuer ?? "Card";
    return {
      id: entry.cardId,
      product: name,
      network: issuer,
      ...(entry.lastFour ? { lastFour: entry.lastFour } : {}),
    };
  });
}

export function summarizeCardBenefits(profiles: CardBenefitProfile[]): string[] {
  const lines = new Set<string>();
  for (const profile of profiles) {
    for (const line of profile.guidance) lines.add(line);
  }
  return [...lines];
}

export function hasCenturionOrPriorityPass(profiles: CardBenefitProfile[]): boolean {
  return profiles.some((p) => p.airport.centurionLounge || p.airport.priorityPass);
}

export function cardHotelGrantForChain(
  profiles: CardBenefitProfile[],
  chain: string,
): CardStatusGrant | null {
  const normalized = chain.trim().toLowerCase();
  for (const profile of profiles) {
    for (const grant of profile.hotelGrants) {
      if (grant.chain.toLowerCase() === normalized) return grant;
    }
  }
  return null;
}
