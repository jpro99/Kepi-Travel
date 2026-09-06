import { addIsoDays } from "@/lib/travelAssistant/tripNightCoverage";
import type { StopDateRange } from "@/lib/decision/stopDates";
import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";

function cityKeysMatch(a: string, b: string): boolean {
  const left = normalizeDayPlanCity(a).toLowerCase();
  const right = normalizeDayPlanCity(b).toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const leftCore = left.split(",")[0]?.trim() ?? left;
  const rightCore = right.split(",")[0]?.trim() ?? right;
  return leftCore === rightCore;
}

/** ISO date keys for days staying in a city — from trip stop ranges, not invented. */
export function dateKeysForStayCity(cityLabel: string, stopRanges: StopDateRange[]): string[] {
  const keys: string[] = [];
  for (const range of stopRanges) {
    if (!cityKeysMatch(range.stop.name, cityLabel)) continue;
    let cursor = range.checkIn.slice(0, 10);
    const end = range.checkOut.slice(0, 10);
    while (cursor && end && cursor < end) {
      keys.push(cursor);
      cursor = addIsoDays(cursor, 1);
    }
  }
  return keys;
}

export function buildPlanCityUrl(city: string, dateKey?: string): string {
  const params = new URLSearchParams();
  params.set("planCity", city);
  if (dateKey) params.set("planCityDate", dateKey);
  return `/travel-assistant?${params.toString()}`;
}
