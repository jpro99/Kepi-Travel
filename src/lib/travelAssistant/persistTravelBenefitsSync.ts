import "server-only";

import type { TravelProfile } from "@/app/api/travel-profile/route";
import { normalizeLoyaltyBalances } from "@/lib/loyalty/walletBalances";
import { getPointsTravelProfile } from "@/lib/memory/pointsTravelProfile";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { buildSyncedTravelProfile } from "@/lib/travelAssistant/syncTravelBenefits";

export const TRAVEL_PROFILE_KEY = "travel-profile:v1";

/** Merge card wallet + loyalty wallet into the travel profile used by Airport Mode. */
export async function syncTravelProfileBenefits(
  userId: string,
  manualProfile?: TravelProfile | null,
): Promise<TravelProfile> {
  const existing =
    manualProfile ?? (await kvStoreGet<TravelProfile>(TRAVEL_PROFILE_KEY, { userId }));
  const points = await getPointsTravelProfile(userId);
  const genome = await getTravelerGenome(userId);
  const merged = buildSyncedTravelProfile({
    existing: existing ?? { airlineStatuses: [] },
    ownedCards: points.ownedCards ?? [],
    loyaltyBalances: normalizeLoyaltyBalances(genome.loyaltyBalances ?? []),
  });
  await kvStoreSet(TRAVEL_PROFILE_KEY, merged, { userId });
  return merged;
}

/** Backfill when cards were saved before benefits sync existed. */
export async function ensureTravelBenefitsFresh(
  userId: string,
  profile: TravelProfile | null,
): Promise<TravelProfile> {
  const points = await getPointsTravelProfile(userId);
  const hasCards = (points.ownedCards?.length ?? 0) > 0;
  const genome = await getTravelerGenome(userId);
  const hasLoyalty = (genome.loyaltyBalances?.length ?? 0) > 0;

  if (!hasCards && !hasLoyalty) {
    return profile ?? { airlineStatuses: [] };
  }

  const stale =
    !profile?.cardsSyncedAt ||
    (hasCards && !(profile.paymentCards?.length ?? 0)) ||
    (hasLoyalty && !(profile.hotelStatuses?.length ?? 0) && !(profile.airlineStatuses?.length ?? 0));

  if (!stale) return profile ?? { airlineStatuses: [] };
  return syncTravelProfileBenefits(userId, profile);
}
