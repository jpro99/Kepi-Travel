import { haversineMeters } from "@/lib/geo/haversineMeters";
import {
  effectiveAccuracyMeters,
  MIN_BOOTSTRAP_ACCURACY_M,
  shouldPreferIncomingLocationFix,
} from "@/lib/family/locationFixUpgrade";

export type FamilyLocationPoint = {
  lat: number;
  lon: number;
  accuracy?: number;
};

export type FamilyLocationWriteDecision =
  | { action: "write"; reason: "bootstrap" | "upgrade" | "update" }
  | { action: "skip"; reason: "awaiting_precise_fix" | "coarse" | "coarse_jump" };

/** Same publish rules as POST /api/family update-location (M20 native + web). */
export function decideFamilyLocationWrite(
  prev: FamilyLocationPoint | null,
  incoming: FamilyLocationPoint,
): FamilyLocationWriteDecision {
  const incomingAccuracy =
    typeof incoming.accuracy === "number" && Number.isFinite(incoming.accuracy) && incoming.accuracy > 0
      ? incoming.accuracy
      : null;

  if (!prev) {
    if (effectiveAccuracyMeters(incoming.accuracy) > MIN_BOOTSTRAP_ACCURACY_M) {
      return { action: "skip", reason: "awaiting_precise_fix" };
    }
    return { action: "write", reason: "bootstrap" };
  }

  if (shouldPreferIncomingLocationFix(prev, incoming)) {
    return { action: "write", reason: "upgrade" };
  }

  if (incomingAccuracy != null && incomingAccuracy > 200) {
    return { action: "skip", reason: "coarse" };
  }

  if (incomingAccuracy != null && incomingAccuracy > 80) {
    const jumpM = haversineMeters(prev.lat, prev.lon, incoming.lat, incoming.lon);
    const prevAcc = prev.accuracy ?? 999;
    if (jumpM > 150 && incomingAccuracy > prevAcc && prevAcc <= 60) {
      return { action: "skip", reason: "coarse_jump" };
    }
  }

  return { action: "write", reason: "update" };
}
