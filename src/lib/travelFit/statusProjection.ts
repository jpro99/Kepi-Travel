import type { StatusProjection } from "@/lib/travelFit/types";

/** Simplified status math — public program thresholds, updated periodically. */
export function projectHyattStatus(input: {
  currentTier?: string;
  nightsThisYear: number;
  typicalNightlyUsd?: number | null;
}): StatusProjection | null {
  const target = input.currentTier?.toLowerCase().includes("globalist") ? 60 : 30;
  const label = input.currentTier?.toLowerCase().includes("globalist") ? "Globalist renewal" : "Explorist / tier progress";
  const projected = input.nightsThisYear;
  const remaining = Math.max(0, target - projected);
  return {
    program: "World of Hyatt",
    currentTier: input.currentTier,
    metricLabel: "nights",
    currentValue: projected,
    targetValue: target,
    projectedValue: projected,
    onTrack: projected >= target * 0.5,
    headline:
      remaining === 0
        ? `On pace for ${label} (${projected}/${target} nights)`
        : `${remaining} more Hyatt night${remaining === 1 ? "" : "s"} toward ${label}`,
    detail:
      input.typicalNightlyUsd != null
        ? `Your stays average about $${input.typicalNightlyUsd}/night — direct Hyatt bookings count toward status.`
        : "Book direct with World of Hyatt so nights count toward status.",
  };
}

export function projectAlaskaStatus(input: {
  currentTier?: string;
  segmentsThisYear: number;
}): StatusProjection | null {
  const target = input.currentTier?.toLowerCase().includes("gold") ? 40 : 20;
  const projected = input.segmentsThisYear;
  const remaining = Math.max(0, target - projected);
  return {
    program: "Alaska Mileage Plan",
    currentTier: input.currentTier,
    metricLabel: "segments",
    currentValue: projected,
    targetValue: target,
    projectedValue: projected,
    onTrack: projected >= target * 0.5,
    headline:
      remaining === 0
        ? `Strong Alaska activity (${projected} segments this year)`
        : `${remaining} more Alaska segment${remaining === 1 ? "" : "s"} toward tier momentum`,
    detail: "Fly Alaska or partners and credit to Mileage Plan to keep MVP benefits working for West Coast trips.",
  };
}

export function buildStatusProjections(input: {
  statuses: Array<{ program: string; tier?: string; airline?: string; hotelChain?: string }>;
  hotelNightsThisYear: number;
  alaskaSegmentsThisYear: number;
  typicalNightlyUsd?: number | null;
}): StatusProjection[] {
  const out: StatusProjection[] = [];
  for (const status of input.statuses) {
    if (/hyatt/i.test(status.program) || status.hotelChain === "Hyatt") {
      const p = projectHyattStatus({
        currentTier: status.tier,
        nightsThisYear: input.hotelNightsThisYear,
        typicalNightlyUsd: input.typicalNightlyUsd,
      });
      if (p) out.push(p);
    }
    if (/alaska|mileage plan/i.test(status.program) || status.airline === "Alaska Airlines") {
      const p = projectAlaskaStatus({
        currentTier: status.tier,
        segmentsThisYear: input.alaskaSegmentsThisYear,
      });
      if (p) out.push(p);
    }
  }
  return out;
}
