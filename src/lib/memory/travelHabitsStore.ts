import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import type { LearnedTravelHabits } from "@/lib/travelFit/types";

const TRAVEL_HABITS_KEY = "travel-habits-snapshot";

/** Server backup of learned habits — merges with device-local copy. */
export async function getTravelHabitsSnapshot(userId: string): Promise<Partial<LearnedTravelHabits> | null> {
  try {
    const stored = await Promise.race([
      kvStoreGet<Partial<LearnedTravelHabits>>(TRAVEL_HABITS_KEY, { userId }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function saveTravelHabitsSnapshot(
  userId: string,
  habits: LearnedTravelHabits,
): Promise<void> {
  await kvStoreSet(
    TRAVEL_HABITS_KEY,
    {
      ...habits,
      updatedAt: new Date().toISOString(),
    },
    { userId },
  );
}
