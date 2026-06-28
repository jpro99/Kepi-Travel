import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

export interface InterCityTransportGap {
  id: string;
  fromLabel: string;
  toLabel: string;
  fromIata: string;
  toIata: string;
  departureDate: string;
  dateDisplay: string;
  role: PlannedFlightLeg["role"];
  leg: PlannedFlightLeg;
}

function fmtLegDate(iso: string): string {
  if (!iso?.trim()) return "your travel day";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Human copy for a missing hop between itinerary cities. */
export function interCityTransportQuestion(gap: InterCityTransportGap): string {
  const when = gap.departureDate ? `On ${fmtLegDate(gap.departureDate)}, you` : "You";
  return `${when} leave ${gap.fromLabel} for ${gap.toLabel} — how are you getting there?`;
}

export function interCityTransportDetail(gap: InterCityTransportGap): string {
  if (gap.role === "connector") {
    return "Kepi doesn't see a flight, train, or transfer booked for this leg yet. Search flights or add ground transport.";
  }
  if (gap.role === "outbound") {
    return "Book how you're getting to the first stop on this trip.";
  }
  return "Book how you're getting home from your last stop.";
}

/** Every unbooked leg from the trip plan that still needs transport. */
export function listMissingTransportGaps(legs: PlannedFlightLeg[]): InterCityTransportGap[] {
  return legs
    .filter((leg) => leg.status === "needed" && leg.enabled !== false)
    .map((leg) => ({
      id: leg.id,
      fromLabel: leg.fromLabel,
      toLabel: leg.toLabel,
      fromIata: leg.fromIata,
      toIata: leg.toIata,
      departureDate: leg.departureDate,
      dateDisplay: fmtLegDate(leg.departureDate),
      role: leg.role,
      leg,
    }));
}
