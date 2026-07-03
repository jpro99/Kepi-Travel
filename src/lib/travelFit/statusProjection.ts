import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";
import {
  combineYtdProgress,
  countKepiYtdHotelNights,
  countKepiYtdSegments,
  type CombinedYtdProgress,
} from "@/lib/loyalty/loyaltyProgress";
import type { TravelFitReservation } from "@/lib/travelFit/types";
import type { StatusProjection } from "@/lib/travelFit/types";

/** Simplified status math — public program thresholds, updated periodically. */
export function projectHyattStatus(input: {
  currentTier?: string;
  progress: CombinedYtdProgress;
  typicalNightlyUsd?: number | null;
}): StatusProjection | null {
  if (!input.progress.hasBaseline && input.progress.kepiAdded === 0) {
    return {
      program: "World of Hyatt",
      currentTier: input.currentTier,
      metricLabel: "nights",
      currentValue: 0,
      targetValue: 30,
      projectedValue: 0,
      onTrack: false,
      headline: "Add your Hyatt nights in Loyalty Wallet",
      detail:
        "Tell Kepi how many qualifying nights you already have this year — we'll add new stays as you book.",
    };
  }

  if (!input.progress.hasBaseline && input.progress.kepiAdded > 0) {
    return {
      program: "World of Hyatt",
      currentTier: input.currentTier,
      metricLabel: "nights",
      currentValue: input.progress.total,
      targetValue: 30,
      projectedValue: input.progress.total,
      onTrack: false,
      headline: "Set your Hyatt starting nights in Loyalty Wallet",
      detail: `${input.progress.kepiAdded} night${input.progress.kepiAdded === 1 ? "" : "s"} tracked in Kepi so far — add your pre-Kepi total so progress is accurate.`,
    };
  }

  const target = input.currentTier?.toLowerCase().includes("globalist") ? 60 : 30;
  const label = input.currentTier?.toLowerCase().includes("globalist") ? "Globalist renewal" : "Explorist / tier progress";
  const projected = input.progress.total;
  const remaining = Math.max(0, target - projected);
  const kepiNote =
    input.progress.kepiAdded > 0
      ? ` (${input.progress.baseline} before Kepi + ${input.progress.kepiAdded} from your trips here)`
      : "";

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
        ? `On pace for ${label} (${projected}/${target} nights${kepiNote})`
        : `${remaining} more Hyatt night${remaining === 1 ? "" : "s"} toward ${label} (${projected}/${target}${kepiNote})`,
    detail:
      input.typicalNightlyUsd != null
        ? `Your stays average about $${input.typicalNightlyUsd}/night — direct Hyatt bookings count toward status.`
        : "Book direct with World of Hyatt so nights count toward status.",
  };
}

export function projectAlaskaStatus(input: {
  currentTier?: string;
  progress: CombinedYtdProgress;
}): StatusProjection | null {
  if (!input.progress.hasBaseline && input.progress.kepiAdded === 0) {
    return {
      program: "Alaska Mileage Plan",
      currentTier: input.currentTier,
      metricLabel: "segments",
      currentValue: 0,
      targetValue: 20,
      projectedValue: 0,
      onTrack: false,
      headline: "Add your Alaska YTD segments in Loyalty Wallet",
      detail:
        "Tell Kepi how many segments you've already flown this year — we'll add new Alaska flights as you book.",
    };
  }

  if (!input.progress.hasBaseline && input.progress.kepiAdded > 0) {
    return {
      program: "Alaska Mileage Plan",
      currentTier: input.currentTier,
      metricLabel: "segments",
      currentValue: input.progress.total,
      targetValue: 20,
      projectedValue: input.progress.total,
      onTrack: false,
      headline: "Set your Alaska starting segments in Loyalty Wallet",
      detail: `${input.progress.kepiAdded} segment${input.progress.kepiAdded === 1 ? "" : "s"} tracked in Kepi — add your pre-Kepi YTD total so we don't over-count what's left.`,
    };
  }

  const target = input.currentTier?.toLowerCase().includes("gold") ? 40 : 20;
  const projected = input.progress.total;
  const remaining = Math.max(0, target - projected);
  const kepiNote =
    input.progress.kepiAdded > 0
      ? ` (${input.progress.baseline} before Kepi + ${input.progress.kepiAdded} here)`
      : "";

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
        ? `Strong Alaska activity (${projected}/${target} segments this year${kepiNote})`
        : `${remaining} more Alaska segment${remaining === 1 ? "" : "s"} toward tier momentum (${projected}/${target}${kepiNote})`,
    detail: "Fly Alaska or partners and credit to Mileage Plan to keep MVP benefits working for West Coast trips.",
  };
}

export function buildStatusProjections(input: {
  loyaltyBalances?: LoyaltyBalance[];
  reservations?: TravelFitReservation[];
  statuses?: Array<{ program: string; tier?: string; airline?: string; hotelChain?: string }>;
  /** @deprecated use loyaltyBalances + reservations */
  hotelNightsThisYear?: number;
  /** @deprecated use loyaltyBalances + reservations */
  alaskaSegmentsThisYear?: number;
  typicalNightlyUsd?: number | null;
}): StatusProjection[] {
  const balances = input.loyaltyBalances ?? [];
  const reservations = input.reservations ?? [];
  const statuses = input.statuses ?? [];
  const out: StatusProjection[] = [];

  const alaskaBalance = balances.find((b) => b.programId === "alaska");
  const hyattBalance = balances.find((b) => b.programId === "hyatt");
  const wantsAlaska =
    alaskaBalance != null ||
    statuses.some((s) => /alaska|mileage plan/i.test(s.program) || s.airline === "Alaska Airlines");
  const wantsHyatt =
    hyattBalance != null ||
    statuses.some((s) => /hyatt/i.test(s.program) || s.hotelChain === "Hyatt");

  if (wantsHyatt) {
    const kepiNights = countKepiYtdHotelNights(reservations, "Hyatt", hyattBalance?.progressBaselineAt);
    const progress = combineYtdProgress(hyattBalance, kepiNights, "nights");
    const tier =
      hyattBalance?.tier ??
      statuses.find((s) => /hyatt/i.test(s.program) || s.hotelChain === "Hyatt")?.tier;
    const projection = projectHyattStatus({
      currentTier: tier,
      progress,
      typicalNightlyUsd: input.typicalNightlyUsd,
    });
    if (projection) out.push(projection);
  }

  if (wantsAlaska) {
    const kepiSegments = countKepiYtdSegments(reservations, "AS", alaskaBalance?.progressBaselineAt);
    const progress = combineYtdProgress(alaskaBalance, kepiSegments, "segments");
    const tier =
      alaskaBalance?.tier ??
      statuses.find((s) => /alaska|mileage plan/i.test(s.program) || s.airline === "Alaska Airlines")?.tier;
    const projection = projectAlaskaStatus({
      currentTier: tier,
      progress,
    });
    if (projection) out.push(projection);
  }

  return out;
}
