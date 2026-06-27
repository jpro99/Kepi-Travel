import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const POINTS_PROFILE_KEY = "points-travel-profile";

export interface OwnedCardEntry {
  cardId: string;
  /** Display label if not in catalog */
  label?: string;
  lastFour?: string;
}

export interface PointsTravelProfile {
  userId: string;
  updatedAt: string;
  ownedCards: OwnedCardEntry[];
  usesRakuten: boolean;
  usesChasePortal: boolean;
  earnGoal: "maximize_miles" | "maximize_cashback" | "balanced";
  typicalHotelNightlyUsd?: number;
  /** Optional disclosed referral URLs — user or admin configured */
  cardReferralLinks: Record<string, string>;
  notes: string;
}

export function createEmptyPointsTravelProfile(userId: string): PointsTravelProfile {
  return {
    userId,
    updatedAt: new Date().toISOString(),
    ownedCards: [],
    usesRakuten: false,
    usesChasePortal: false,
    earnGoal: "maximize_miles",
    cardReferralLinks: {},
    notes: "",
  };
}

export async function getPointsTravelProfile(userId?: string): Promise<PointsTravelProfile> {
  const namespace = userId?.trim() || "anonymous";
  try {
    const existing = await Promise.race([
      kvStoreGet<PointsTravelProfile>(POINTS_PROFILE_KEY, { userId: namespace }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (existing) return existing;
  } catch {
    /* degrade */
  }
  const seeded = createEmptyPointsTravelProfile(namespace);
  kvStoreSet(POINTS_PROFILE_KEY, seeded, { userId: namespace }).catch(() => {});
  return seeded;
}

export async function savePointsTravelProfile(
  profile: PointsTravelProfile,
  userId?: string,
): Promise<PointsTravelProfile> {
  const updated = { ...profile, updatedAt: new Date().toISOString(), userId: userId ?? profile.userId };
  await kvStoreSet(POINTS_PROFILE_KEY, updated, { userId: updated.userId });
  return updated;
}
