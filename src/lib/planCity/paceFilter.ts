import type { PlanCityPace, PlanCityStop } from "@/lib/planCity/types";

const PACE_ORDER: PlanCityPace[] = ["easy", "full", "ambitious"];

/** Filters catalog stops for the selected pace — never adds POIs. */
export function filterStopsForPace(stops: PlanCityStop[], pace: PlanCityPace): PlanCityStop[] {
  const tierIndex = PACE_ORDER.indexOf(pace);
  return stops.filter((stop) => {
    if (!stop.paceTags?.length) return pace === "ambitious";
    return stop.paceTags.some((tag) => PACE_ORDER.indexOf(tag) <= tierIndex);
  });
}

export function kindLabel(kind: PlanCityStop["kind"]): string {
  switch (kind) {
    case "church":
      return "Church";
    case "museum":
      return "Museum";
    case "walk":
      return "Walk";
    case "viewpoint":
      return "Viewpoint";
    case "food":
      return "Food";
    case "gelato":
      return "Gelato";
    case "other":
      return "Other";
    default:
      return kind;
  }
}

export function dwellLabel(dwell: PlanCityStop["dwell"]): string {
  if (dwell.unknown || !Number.isFinite(dwell.minutes)) return "Dwell unknown";
  return `${dwell.minutes} min`;
}
