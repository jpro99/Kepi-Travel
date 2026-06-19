import { shiftIsoDate } from "@/lib/providers/duffel/flexFlightSearch";
import type { TripTopologyCandidate } from "@/lib/decision/topology/types";

/** Joint shift — preserves trip length (outbound + return move together). */
export function shiftCandidateDates(
  candidate: TripTopologyCandidate,
  shiftDays: number,
): TripTopologyCandidate {
  if (shiftDays === 0) return candidate;
  const shift = (iso: string) => shiftIsoDate(iso, shiftDays);
  const label =
    shiftDays > 0 ? `+${shiftDays}d flex` : `${shiftDays}d flex`;

  return {
    ...candidate,
    id: `${candidate.id}-flex${shiftDays}`,
    kind: candidate.kind,
    title: `${candidate.title} · ${label}`,
    headline: `${candidate.headline} · ${label}`,
    dateShiftDays: shiftDays,
    flightLegs: candidate.flightLegs.map((leg) => ({
      ...leg,
      departureDate: shift(leg.departureDate),
    })),
    wave: 4,
    estimateLowerBoundUsd: Math.round(candidate.estimateLowerBoundUsd * (shiftDays === 0 ? 1 : 0.94)),
  };
}

export const JOINT_DATE_SHIFTS = [-7, -5, -3, 3, 5, 7] as const;
