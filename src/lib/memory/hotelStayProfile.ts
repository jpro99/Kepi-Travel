import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const HOTEL_STAY_PROFILE_KEY = "hotel-stay-profile";

export type BreakfastPreference = "required" | "nice_to_have" | "dont_care";
export type HotelQualityFloor = "budget" | "mid" | "high" | "luxury";

/** Long-lived preferences the user describes once — applied to every hotel search. */
export interface HotelStayProfile {
  userId: string;
  updatedAt: string;
  completed: boolean;
  requiresElevator: boolean;
  avoidStairs: boolean;
  prefersBalcony: boolean;
  prefersOceanView: boolean;
  prefersNearTransit: boolean;
  prefersCentralArea: boolean;
  prefersBreakfast: BreakfastPreference;
  qualityFloor: HotelQualityFloor;
  /** Raw description for display and future AI enrichment. */
  freeTextSummary: string;
}

export function createEmptyHotelStayProfile(userId: string): HotelStayProfile {
  return {
    userId,
    updatedAt: new Date().toISOString(),
    completed: false,
    requiresElevator: false,
    avoidStairs: false,
    prefersBalcony: false,
    prefersOceanView: false,
    prefersNearTransit: false,
    prefersCentralArea: true,
    prefersBreakfast: "dont_care",
    qualityFloor: "mid",
    freeTextSummary: "",
  };
}

export async function getHotelStayProfile(userId?: string): Promise<HotelStayProfile> {
  const namespace = userId?.trim() || "anonymous";
  try {
    const existing = await Promise.race([
      kvStoreGet<HotelStayProfile>(HOTEL_STAY_PROFILE_KEY, { userId: namespace }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (existing) return existing;
  } catch {
    /* degrade */
  }
  const seeded = createEmptyHotelStayProfile(namespace);
  kvStoreSet(HOTEL_STAY_PROFILE_KEY, seeded, { userId: namespace }).catch(() => {});
  return seeded;
}

export async function saveHotelStayProfile(
  profile: HotelStayProfile,
  userId?: string,
): Promise<HotelStayProfile> {
  const updated: HotelStayProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    completed: profile.completed || profile.freeTextSummary.trim().length >= 12,
  };
  await kvStoreSet(HOTEL_STAY_PROFILE_KEY, updated, { userId: userId ?? profile.userId });
  return updated;
}

export function summarizeHotelStayProfile(profile: HotelStayProfile): string | null {
  if (!profile.completed && !profile.freeTextSummary.trim()) return null;
  const parts: string[] = [];
  if (profile.requiresElevator || profile.avoidStairs) parts.push("elevator / no stairs");
  if (profile.prefersBalcony) parts.push("balcony when possible");
  if (profile.prefersOceanView) parts.push("near the ocean");
  if (profile.prefersNearTransit) parts.push("near train or metro");
  if (profile.prefersBreakfast === "required") parts.push("breakfast included");
  else if (profile.prefersBreakfast === "nice_to_have") parts.push("breakfast is a plus");
  if (profile.qualityFloor === "luxury" || profile.qualityFloor === "high") parts.push("quality & cleanliness");
  if (parts.length === 0 && profile.freeTextSummary.trim()) {
    return profile.freeTextSummary.trim().slice(0, 120);
  }
  if (parts.length === 0) return null;
  return `Your stay style: ${parts.join(" · ")}.`;
}
