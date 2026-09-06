import type { PlanCityStop } from "@/lib/planCity/types";
import { sourceChipLabel } from "@/lib/planCity/provenance";
import { kindLabel } from "@/lib/planCity/paceFilter";

/** Single bullet line for itinerary day notes — provenance visible, no invented dwell. */
export function formatPlanCityStopBullet(stop: PlanCityStop): string {
  const kind = kindLabel(stop.kind);
  const source = sourceChipLabel(stop.source.kind);
  return `${stop.name} (${kind} · ${source})`;
}

export function formatPlanCityStopsForDayNotes(stops: PlanCityStop[]): string {
  return stops.map((stop) => `• ${formatPlanCityStopBullet(stop)}`).join("\n");
}
