import type { DayPlanRecord } from "@/lib/travelAssistant/itineraryDayPlan";
import { dedupeDayPlanBullets } from "@/lib/travelAssistant/dayPlanBulletGroups";
import type { PlanCityStop } from "@/lib/planCity/types";
import { formatPlanCityStopBullet } from "@/lib/planCity/formatStopBullet";

export interface SavePlanCityToDayInput {
  existingPlan: DayPlanRecord;
  cityLabel: string;
  selectedStops: PlanCityStop[];
  /** Optional day heading — e.g. "Easy pace · Lecce". */
  dayHeading?: string;
}

export interface SavePlanCityToDayResult {
  plan: DayPlanRecord;
  bulletsAdded: string[];
}

function parseExistingActivityBullets(notes: string): string[] {
  return notes
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[\s•\-*]+/u, "").trim())
    .filter(Boolean);
}

/** Merge selected Plan City stops onto an existing day plan without wiping hotel/stay lines. */
export function savePlanCityStopsToDayPlan(input: SavePlanCityToDayInput): SavePlanCityToDayResult {
  const bulletsAdded = input.selectedStops.map((stop) => formatPlanCityStopBullet(stop));
  const existingBullets = parseExistingActivityBullets(input.existingPlan.notes);
  const merged = dedupeDayPlanBullets([...existingBullets, ...bulletsAdded]);

  const plan: DayPlanRecord = {
    ...input.existingPlan,
    location: input.existingPlan.location.trim() || input.cityLabel,
    notes: merged.map((line) => `• ${line}`).join("\n"),
    dayHeading: input.dayHeading?.trim() || input.existingPlan.dayHeading,
  };

  return { plan, bulletsAdded };
}

/** Spread stops across consecutive date keys when saving a multi-day city stay. */
export function distributeStopsAcrossDates(
  dateKeys: string[],
  stops: PlanCityStop[],
): Array<{ dateKey: string; stops: PlanCityStop[] }> {
  if (dateKeys.length === 0 || stops.length === 0) return [];
  if (dateKeys.length === 1) return [{ dateKey: dateKeys[0]!, stops }];

  const perDay = Math.max(1, Math.ceil(stops.length / dateKeys.length));
  const out: Array<{ dateKey: string; stops: PlanCityStop[] }> = [];
  let cursor = 0;
  for (const dateKey of dateKeys) {
    const slice = stops.slice(cursor, cursor + perDay);
    if (slice.length === 0) break;
    out.push({ dateKey, stops: slice });
    cursor += slice.length;
  }
  if (cursor < stops.length && out.length > 0) {
    const last = out[out.length - 1]!;
    last.stops = [...last.stops, ...stops.slice(cursor)];
  }
  return out;
}
