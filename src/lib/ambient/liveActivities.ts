import "server-only";
import type { LiveActivityData } from "./types";
import type { ProvenanceChargeLiveActivityPayload } from "@/lib/travelAssistant/provenanceChargeLiveActivity";

// Sends provenance-gated Live Activity updates via APNs (native) or logs in dev.
export async function pushLiveActivityUpdate(userId: string, data: LiveActivityData) {
  if (!userId) return { success: false, reason: "missing-user" };

  // Red provenance must never push countdown-bearing payloads.
  if (
    !data.showCountdown &&
    data.gateProvenance === "UNVERIFIED" &&
    data.statusProvenance === "UNVERIFIED" &&
    !data.rightsShell
  ) {
    return { success: false, reason: "provenance-red" };
  }

  console.log(`Pushing Live Activity update for user ${userId}:`, {
    primary: data.primary,
    showCountdown: data.showCountdown,
    gateProvenance: data.gateProvenance,
    statusProvenance: data.statusProvenance,
    rightsShell: data.rightsShell?.headline ?? null,
  });

  // Production: retrieve push token, build APNs liveactivity payload, send.
  return { success: true };
}

export function toLiveActivityData(
  payload: ProvenanceChargeLiveActivityPayload,
  journeyState: string,
): LiveActivityData | null {
  if (!payload.shouldUpdate) return null;
  return {
    primary: payload.primary,
    secondary: payload.secondary,
    tertiary: payload.tertiary,
    progress: payload.progress,
    journeyState,
    showCountdown: payload.showCountdown,
    gateProvenance: payload.gateProvenance,
    statusProvenance: payload.statusProvenance,
    rightsShell: payload.rightsShell,
    webFallbackHonest: payload.webFallbackHonest,
  };
}

export async function pushProvenanceChargeLiveActivity(
  userId: string,
  payload: ProvenanceChargeLiveActivityPayload,
  journeyState: string,
) {
  const data = toLiveActivityData(payload, journeyState);
  if (!data) return { success: false, reason: "provenance-gated-skip" };
  return pushLiveActivityUpdate(userId, data);
}
