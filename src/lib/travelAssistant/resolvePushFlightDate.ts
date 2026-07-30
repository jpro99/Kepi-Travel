/**
 * Resolve the flight date used for status push snapshot keys (F13).
 * Prefer the provider-supplied reservation date — never silently key on "today"
 * when a real flightDate exists (that caused gate alerts to miss / collide).
 */

import type { TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

export function resolvePushFlightDate(
  update: Pick<TravelUpdateEvent, "flightDate">,
  now: Date = new Date(),
): string {
  const fromUpdate = update.flightDate?.trim() ?? "";
  if (ISO_DAY.test(fromUpdate)) {
    return fromUpdate;
  }
  // ESTIMATE — last resort when a provider omitted date (should not happen for live flights).
  return now.toISOString().slice(0, 10);
}
