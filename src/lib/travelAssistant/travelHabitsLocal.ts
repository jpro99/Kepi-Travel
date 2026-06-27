import type { LearnedTravelHabits } from "@/lib/travelFit/types";

const STORAGE_PREFIX = "kepi-travel-habits:";

function keyForUser(userId: string): string {
  return `${STORAGE_PREFIX}${userId.trim() || "anonymous"}`;
}

/** Device-local travel habits — not full card numbers, only learned patterns. */
export function loadLocalTravelHabits(userId: string): Partial<LearnedTravelHabits> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyForUser(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<LearnedTravelHabits>;
  } catch {
    return null;
  }
}

export function saveLocalTravelHabits(userId: string, habits: LearnedTravelHabits): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyForUser(userId), JSON.stringify(habits));
  } catch {
    /* quota / private mode */
  }
}

export function clearLocalTravelHabits(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(keyForUser(userId));
  } catch {
    /* ignore */
  }
}

export const LOCAL_HABITS_DISCLOSURE =
  "Your travel patterns are saved on this device. Sign in to optionally back them up to your Kepi account.";
