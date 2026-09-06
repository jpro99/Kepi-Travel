/**
 * Corroborated Gate Harvest (v1) — Breakthrough B.
 * Pins stay TRAVELER_OBSERVED until N≥2 independent corroborations in a spatial
 * geofence OR official STRING match — then eligible for Facts promotion path.
 * v1: same-user re-pass counts as independent (documented in module header).
 */

import { metersBetween } from "@/lib/airportNav/directionArrow";
import { sanitizeTravelerGateString } from "@/lib/airportNav/travelerCapture";
import type { TravelerCaptureRecord } from "@/lib/airportNav/travelerCaptureTypes";

/** Minimum independent corroborations before Facts promotion eligibility. */
export const CORROBORATION_THRESHOLD = 2;

/** Spatial geofence for map-mark corroboration (meters). */
export const GATE_HARVEST_GEOFENCE_METERS = 50;

export type GatePromotionStatus = "provisional" | "corroborated" | "official_match";

export type PlacardClass = "gate_sign" | "departures_board" | "floor" | "unknown";

export interface GateCorroborationResult {
  status: GatePromotionStatus;
  corroborationCount: number;
  gateString: string | null;
  eligibleForFactsPromotion: boolean;
  rejectReason?: string;
}

/** Classify pin note before promote — gate-sign vs bare floor. */
export function classifyPlacardNote(pinNote: string | null | undefined): PlacardClass {
  const note = (pinNote ?? "").trim().toLowerCase();
  if (!note) return "unknown";
  if (/\bgate\b|\bboarding\b|\bdepartures?\b|\bflight\b/u.test(note)) return "gate_sign";
  if (/\bboard\b|\bfids\b|\bscreen\b|\bmonitor\b/u.test(note)) return "departures_board";
  if (/\bfloor\b|\btile\b|\bcarpet\b|\bground\b/u.test(note)) return "floor";
  return "unknown";
}

/** Reject bare floor taps — map mark with no gate, note, or placard classification. */
export function isBareFloorTap(
  capture: Pick<TravelerCaptureRecord, "mapMark" | "gateString" | "note">,
): boolean {
  const hasGate = Boolean(sanitizeTravelerGateString(capture.gateString));
  const hasNote = Boolean((capture.note ?? "").trim());
  const pinNote = capture.mapMark?.pinNote;
  const placard = classifyPlacardNote(pinNote);
  if (hasGate || hasNote) return false;
  if (!capture.mapMark) return true;
  return placard === "floor" || placard === "unknown";
}

function capturesInGeofence(a: TravelerCaptureRecord, b: TravelerCaptureRecord): boolean {
  const markA = a.mapMark;
  const markB = b.mapMark;
  if (!markA || !markB) return false;
  if (
    !Number.isFinite(markA.lat) ||
    !Number.isFinite(markA.lng) ||
    !Number.isFinite(markB.lat) ||
    !Number.isFinite(markB.lng)
  ) {
    return false;
  }
  const dist = metersBetween([markA.lng, markA.lat], [markB.lng, markB.lat]);
  return dist <= GATE_HARVEST_GEOFENCE_METERS;
}

function sameGateString(a: TravelerCaptureRecord, b: TravelerCaptureRecord): boolean {
  const gateA = sanitizeTravelerGateString(a.gateString);
  const gateB = sanitizeTravelerGateString(b.gateString);
  return Boolean(gateA && gateB && gateA === gateB);
}

/**
 * v1 experiment: same-user re-pass is independent when capture ids differ.
 * Multi-traveler infra is not required for the corroboration count.
 */
export function areIndependentCorroborations(
  a: TravelerCaptureRecord,
  b: TravelerCaptureRecord,
): boolean {
  if (a.id === b.id) return false;
  if (a.iata.trim().toUpperCase() !== b.iata.trim().toUpperCase()) return false;
  return sameGateString(a, b) || capturesInGeofence(a, b);
}

function countCorroborationsForCapture(
  capture: TravelerCaptureRecord,
  pool: readonly TravelerCaptureRecord[],
): number {
  let count = 1;
  for (const other of pool) {
    if (capture.id !== other.id && areIndependentCorroborations(capture, other)) {
      count += 1;
    }
  }
  return count;
}

export function evaluateGateCorroboration(
  captures: readonly TravelerCaptureRecord[],
  options?: {
    officialGateString?: string | null;
    iata?: string;
  },
): GateCorroborationResult {
  const iata = (options?.iata ?? captures[0]?.iata ?? "").trim().toUpperCase();
  const relevant = captures.filter(
    (capture) => capture.iata.trim().toUpperCase() === iata && !isBareFloorTap(capture),
  );

  if (relevant.length === 0) {
    return {
      status: "provisional",
      corroborationCount: 0,
      gateString: null,
      eligibleForFactsPromotion: false,
      rejectReason: "No valid captures — bare floor taps rejected",
    };
  }

  const official = sanitizeTravelerGateString(options?.officialGateString);
  const observedGates = relevant
    .map((capture) => sanitizeTravelerGateString(capture.gateString))
    .filter(Boolean) as string[];

  if (official && observedGates.some((gate) => gate === official)) {
    return {
      status: "official_match",
      corroborationCount: relevant.length,
      gateString: official,
      eligibleForFactsPromotion: true,
    };
  }

  let maxCluster = 0;
  let clusterGate: string | null = null;
  for (const capture of relevant) {
    const count = countCorroborationsForCapture(capture, relevant);
    if (count > maxCluster) {
      maxCluster = count;
      clusterGate = sanitizeTravelerGateString(capture.gateString);
    }
  }

  if (maxCluster >= CORROBORATION_THRESHOLD) {
    return {
      status: "corroborated",
      corroborationCount: maxCluster,
      gateString: clusterGate,
      eligibleForFactsPromotion: true,
    };
  }

  return {
    status: "provisional",
    corroborationCount: maxCluster,
    gateString: clusterGate,
    eligibleForFactsPromotion: false,
  };
}
