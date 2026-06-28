import type { TravelProfile } from "@/app/api/travel-profile/route";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";
import { getProgramById } from "@/lib/loyalty/programs";
import type { OwnedCardEntry } from "@/lib/memory/pointsTravelProfile";
import {
  cardHotelGrantForChain,
  getCardBenefitProfile,
  listBenefitsForOwnedCards,
  paymentCardsFromOwned,
  summarizeCardBenefits,
} from "@/lib/points/cardBenefits";
import { findProgram, findTier } from "@/lib/travelAssistant/airlineStatus";

const HOTEL_TIER_RANK: Record<string, number> = {
  member: 1,
  discoverist: 2,
  explorist: 3,
  globalist: 4,
  gold: 2,
  "gold elite": 2,
  platinum: 3,
  titanium: 4,
  diamond: 5,
};

const LOYALTY_HOTEL_MAP: Record<string, string> = {
  hyatt: "Hyatt",
  marriott: "Marriott",
  hilton: "Hilton",
  ihg: "IHG",
};

const LOYALTY_AIRLINE_MAP: Record<string, { airline: string; iata?: string }> = {
  alaska: { airline: "Alaska Airlines", iata: "AS" },
  delta: { airline: "Delta Air Lines", iata: "DL" },
  united: { airline: "United Airlines", iata: "UA" },
  american: { airline: "American Airlines", iata: "AA" },
  southwest: { airline: "Southwest Airlines", iata: "WN" },
  jetblue: { airline: "JetBlue", iata: "B6" },
};

function tierRank(tier: string): number {
  const key = tier.trim().toLowerCase();
  return HOTEL_TIER_RANK[key] ?? 1;
}

function mergeHotelTier(existing: string | undefined, incoming: string): string {
  if (!existing) return incoming;
  return tierRank(incoming) >= tierRank(existing) ? incoming : existing;
}

function airlineStatusFromLoyalty(balances: LoyaltyBalance[]): TravelProfile["airlineStatuses"] {
  const out: TravelProfile["airlineStatuses"] = [];
  for (const balance of balances) {
    const mapped = LOYALTY_AIRLINE_MAP[balance.programId];
    if (!mapped || !balance.tier?.trim()) continue;
    out.push({
      airline: mapped.airline,
      tier: balance.tier.trim(),
      iata: mapped.iata,
      program: getProgramById(balance.programId)?.name,
    });
  }
  return out;
}

function hotelStatusFromLoyalty(balances: LoyaltyBalance[]): NonNullable<TravelProfile["hotelStatuses"]> {
  const out: NonNullable<TravelProfile["hotelStatuses"]> = [];
  for (const balance of balances) {
    const chain = LOYALTY_HOTEL_MAP[balance.programId];
    if (!chain || !balance.tier?.trim()) continue;
    out.push({
      chain,
      tier: balance.tier.trim(),
      number: balance.memberNumber,
    });
  }
  return out;
}

function mergeAirlineStatuses(
  manual: TravelProfile["airlineStatuses"],
  fromLoyalty: TravelProfile["airlineStatuses"],
  fromCards: TravelProfile["airlineStatuses"],
): TravelProfile["airlineStatuses"] {
  const byAirline = new Map<string, TravelProfile["airlineStatuses"][number]>();

  const add = (entry: TravelProfile["airlineStatuses"][number]) => {
    const key = entry.airline.toLowerCase();
    const existing = byAirline.get(key);
    if (!existing) {
      byAirline.set(key, entry);
      return;
    }
    if (tierRank(entry.tier) >= tierRank(existing.tier)) {
      byAirline.set(key, { ...existing, ...entry });
    }
  };

  for (const entry of manual) add(entry);
  for (const entry of fromLoyalty) add(entry);
  for (const entry of fromCards) add(entry);

  return [...byAirline.values()];
}

function mergeHotelStatuses(
  manual: NonNullable<TravelProfile["hotelStatuses"]>,
  fromLoyalty: NonNullable<TravelProfile["hotelStatuses"]>,
  fromCards: NonNullable<TravelProfile["hotelStatuses"]>,
): NonNullable<TravelProfile["hotelStatuses"]> {
  const byChain = new Map<string, NonNullable<TravelProfile["hotelStatuses"]>[number]>();

  const add = (entry: NonNullable<TravelProfile["hotelStatuses"]>[number]) => {
    const key = entry.chain.toLowerCase();
    const existing = byChain.get(key);
    if (!existing) {
      byChain.set(key, entry);
      return;
    }
    byChain.set(key, {
      ...existing,
      tier: mergeHotelTier(existing.tier, entry.tier),
    });
  };

  for (const entry of manual) add(entry);
  for (const entry of fromLoyalty) add(entry);
  for (const entry of fromCards) add(entry);

  return [...byChain.values()];
}

function hotelStatusesFromCards(ownedCards: OwnedCardEntry[]): NonNullable<TravelProfile["hotelStatuses"]> {
  const profiles = listBenefitsForOwnedCards(ownedCards.map((c) => c.cardId));
  const out: NonNullable<TravelProfile["hotelStatuses"]> = [];
  for (const profile of profiles) {
    for (const grant of profile.hotelGrants) {
      out.push({ chain: grant.chain, tier: grant.tier });
    }
  }
  return out;
}

function airlineStatusesFromCards(ownedCards: OwnedCardEntry[]): TravelProfile["airlineStatuses"] {
  const out: TravelProfile["airlineStatuses"] = [];
  for (const card of ownedCards) {
    const profile = getCardBenefitProfile(card.cardId);
    if (!profile) continue;
    for (const grant of profile.airlineGrants) {
      out.push({ airline: grant.airline, tier: grant.tier });
    }
  }
  return out;
}

/** Merge card wallet + loyalty wallet into airport/hotel travel profile benefits. */
export function buildSyncedTravelProfile(input: {
  existing: TravelProfile | null;
  ownedCards: OwnedCardEntry[];
  loyaltyBalances: LoyaltyBalance[];
}): TravelProfile {
  const existing = input.existing ?? { airlineStatuses: [] };
  const cardProfiles = listBenefitsForOwnedCards(input.ownedCards.map((c) => c.cardId));

  const manualAir = existing.airlineStatuses ?? [];
  const manualHotel = existing.hotelStatuses ?? [];

  const merged: TravelProfile = {
    ...existing,
    airlineStatuses: mergeAirlineStatuses(
      manualAir,
      airlineStatusFromLoyalty(input.loyaltyBalances),
      airlineStatusesFromCards(input.ownedCards),
    ),
    hotelStatuses: mergeHotelStatuses(
      manualHotel,
      hotelStatusFromLoyalty(input.loyaltyBalances),
      hotelStatusesFromCards(input.ownedCards),
    ),
    paymentCards: paymentCardsFromOwned(input.ownedCards),
    benefitSummary: summarizeCardBenefits(cardProfiles),
    cardsSyncedAt: new Date().toISOString(),
  };

  return merged;
}

/** Match stored status to the airline you're flying today — not just the first entry. */
export function matchAirlineStatusForFlight(
  profile: TravelProfile | null,
  airlineHint: string,
): TravelProfile["airlineStatuses"][number] | null {
  if (!profile?.airlineStatuses?.length || !airlineHint.trim()) return null;
  const hint = airlineHint.trim().toLowerCase();
  const flightProg = findProgram(airlineHint);

  for (const entry of profile.airlineStatuses) {
    const entryAirline = entry.airline.toLowerCase();
    if (hint.includes(entryAirline) || entryAirline.includes(hint)) return entry;
    if (entry.iata && hint.includes(entry.iata.toLowerCase())) return entry;
    const entryProg = findProgram(entry.airline);
    if (flightProg && entryProg && flightProg.iata.some((code) => entryProg.iata.includes(code))) {
      return entry;
    }
  }
  return null;
}

export function resolveFlightStatusTier(
  profile: TravelProfile | null,
  airlineHint: string,
): {
  statusEntry: TravelProfile["airlineStatuses"][number] | null;
  program: ReturnType<typeof findProgram>;
  tier: ReturnType<typeof findTier>;
} {
  const statusEntry = matchAirlineStatusForFlight(profile, airlineHint);
  if (!statusEntry) {
    return { statusEntry: null, program: findProgram(airlineHint), tier: null };
  }
  const program = findProgram(statusEntry.airline) ?? findProgram(airlineHint);
  const tier = program ? findTier(program, statusEntry.tier) : null;
  return { statusEntry, program, tier };
}

export function hotelCheckInGuidance(
  profile: TravelProfile | null,
  chain: string,
): string | null {
  if (!profile) return null;
  const normalized = chain.trim().toLowerCase();
  const status = profile.hotelStatuses?.find((entry) => entry.chain.toLowerCase() === normalized);
  if (!status) return null;

  if (normalized === "hyatt") {
    const tier = status.tier.toLowerCase();
    if (tier.includes("globalist")) {
      return "You're Globalist — use the World of Hyatt elite check-in line and ask about suite upgrades.";
    }
    if (tier.includes("explorist")) {
      return "You're Explorist — use the World of Hyatt / elite check-in counter, not the main queue.";
    }
    if (tier.includes("discoverist")) {
      return "You're Discoverist — look for the World of Hyatt member line at check-in.";
    }
  }

  return `You're ${status.tier} with ${status.chain} — use the elite / member check-in line if marked.`;
}

export function airportCheckInGuidance(input: {
  profile: TravelProfile | null;
  airlineName: string;
  tier: ReturnType<typeof findTier>;
}): string | null {
  const { profile, airlineName, tier } = input;
  const cards = profile?.paymentCards ?? [];

  if (tier?.priorityBoarding || tier?.prioritySecurity) {
    const lane =
      tier.tier.toLowerCase().includes("gold") ||
      tier.tier.toLowerCase().includes("platinum") ||
      tier.tier.toLowerCase().includes("1k") ||
      tier.tier.toLowerCase().includes("executive")
        ? "priority / first class check-in counter"
        : "priority check-in line";
    return `You're ${tier.tier} on ${airlineName} — skip the economy queue and use the ${lane}.`;
  }

  if (cards.length === 0) return null;

  const lower = airlineName.toLowerCase();
  const platinum = cards.find((c) => c.product.toLowerCase().includes("platinum"));
  if (platinum && (lower.includes("delta") || lower.includes("alaska") || lower.includes("united"))) {
    return `${platinum.product}: when you paid with this card, ask for premium check-in instead of waiting in the main line.`;
  }

  return null;
}

export function cardHotelGrantLine(chain: string, ownedCardIds: string[]): string | null {
  const grant = cardHotelGrantForChain(listBenefitsForOwnedCards(ownedCardIds), chain);
  if (!grant) return null;
  return `${grant.tier} via your card${grant.note ? ` (${grant.note})` : ""}`;
}
