"use client";

/**
 * Foreground drain for traveler capture outbox — no Background Sync on iPhone.
 */

import { syncPendingTravelerCaptures } from "@/lib/airportNav/travelerCaptureLocal";

export type TravelerCaptureDrainListener = (syncedCount: number) => void;

let drainInFlight = false;
let wired = false;
const listeners = new Set<TravelerCaptureDrainListener>();

export function subscribeTravelerCaptureDrain(listener: TravelerCaptureDrainListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function drainOnce(): Promise<number> {
  if (drainInFlight || typeof navigator !== "undefined" && !navigator.onLine) {
    return 0;
  }
  drainInFlight = true;
  try {
    const synced = await syncPendingTravelerCaptures();
    if (synced > 0) {
      for (const listener of listeners) {
        listener(synced);
      }
    }
    return synced;
  } finally {
    drainInFlight = false;
  }
}

/** Wire online + visibilitychange foreground drain (call once from travel-assistant root). */
export function wireTravelerCaptureDrain(): () => void {
  if (wired || typeof window === "undefined") {
    return () => undefined;
  }
  wired = true;

  const onDrain = () => {
    if (document.visibilityState === "hidden") return;
    void drainOnce();
  };

  window.addEventListener("online", onDrain);
  document.addEventListener("visibilitychange", onDrain);

  return () => {
    wired = false;
    window.removeEventListener("online", onDrain);
    document.removeEventListener("visibilitychange", onDrain);
  };
}

export async function drainTravelerCaptureOutboxNow(): Promise<number> {
  return drainOnce();
}
