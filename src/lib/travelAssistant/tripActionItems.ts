import { segmentsNeedingHotel, type TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { detectTripGaps, type TripGap } from "@/lib/travelAssistant/gapDetectionService";
import { runItinerarySelfCheck } from "@/lib/travelAssistant/itinerarySelfCheck";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

export type TripActionKind = "hotel" | "flight" | "transport" | "import" | "review";

export interface TripActionItem {
  id: string;
  kind: TripActionKind;
  emoji: string;
  label: string;
  detail?: string;
  priority: number;
  plannedCityId?: string;
  segmentId?: string;
  flightLegId?: string;
}

function shortCityName(city: string): string {
  return city.split("(")[0]?.trim() || city;
}

function hotelKey(city: string, checkIn: string): string {
  return `${shortCityName(city).toLowerCase()}|${checkIn.slice(0, 10)}`;
}

function gapToAction(gap: TripGap, priority: number): TripActionItem | null {
  if (gap.id.startsWith("placeholder") || gap.id === "missing-confirmation-codes") {
    return {
      id: `gap-${gap.id}`,
      kind: "import",
      emoji: gap.emoji,
      label: gap.title,
      detail: gap.detail.slice(0, 120),
      priority,
    };
  }
  if (gap.actionLabel?.toLowerCase().includes("transport") || gap.id.startsWith("no-transport")) {
    return {
      id: `gap-${gap.id}`,
      kind: "transport",
      emoji: gap.emoji,
      label: gap.title,
      detail: gap.detail.slice(0, 120),
      priority,
    };
  }
  if (gap.severity === "critical") {
    return {
      id: `gap-${gap.id}`,
      kind: "review",
      emoji: gap.emoji,
      label: gap.title,
      detail: gap.detail.slice(0, 120),
      priority,
    };
  }
  return null;
}

/**
 * Compact, clickable planning tasks derived from itinerary — not AI guesses.
 */
export function buildTripActionItems(args: {
  plannedStayCities: PlannedStayCity[];
  tripStaySegments: TripStaySegment[];
  plannedFlightLegs: PlannedFlightLeg[];
  transportReservations: TransportRouteReservation[];
}): TripActionItem[] {
  const items: TripActionItem[] = [];
  const seenHotels = new Set<string>();
  const seenFlights = new Set<string>();

  for (const city of args.plannedStayCities) {
    if (city.status !== "needed") continue;
    const key = hotelKey(city.city, city.checkIn);
    if (seenHotels.has(key)) continue;
    seenHotels.add(key);
    items.push({
      id: `hotel-plan-${city.id}`,
      kind: "hotel",
      emoji: "🏨",
      label: `Book hotel in ${shortCityName(city.city)}`,
      detail: `${city.nights} night${city.nights === 1 ? "" : "s"} · ${city.checkIn}`,
      priority: 10,
      plannedCityId: city.id,
    });
  }

  for (const segment of segmentsNeedingHotel(args.tripStaySegments)) {
    const key = hotelKey(segment.city, segment.checkIn);
    if (seenHotels.has(key)) continue;
    seenHotels.add(key);
    items.push({
      id: `hotel-seg-${segment.id}`,
      kind: "hotel",
      emoji: "🏨",
      label: `Book hotel in ${shortCityName(segment.city)}`,
      detail: segment.label,
      priority: 12,
      segmentId: segment.id,
    });
  }

  for (const leg of args.plannedFlightLegs) {
    if (leg.status !== "needed") continue;
    const route = `${leg.fromIata}-${leg.toIata}`;
    if (seenFlights.has(route)) continue;
    seenFlights.add(route);
    const rolePriority =
      leg.role === "outbound" ? 5 : leg.role === "return" ? 8 : leg.role === "connector" ? 14 : 11;
    items.push({
      id: `flight-${leg.id}`,
      kind: "flight",
      emoji: "✈️",
      label: `Book ${leg.fromLabel ?? leg.fromIata} → ${leg.toLabel ?? leg.toIata}`,
      detail: leg.departureDate ? `Depart ${leg.departureDate}` : undefined,
      priority: rolePriority,
      flightLegId: leg.id,
    });
  }

  const selfCheck = runItinerarySelfCheck({
    reservations: args.transportReservations,
    plannedFlightLegs: args.plannedFlightLegs,
  });
  for (const check of selfCheck.items) {
    if (check.status === "pass") continue;
    if (check.id === "flight-home" && check.status === "fail") {
      const hasReturn = items.some((item) => item.kind === "flight" && item.flightLegId?.includes("return"));
      if (!hasReturn) {
        items.push({
          id: "selfcheck-flight-home",
          kind: "flight",
          emoji: "🏠",
          label: "Book flight home",
          detail: check.answer,
          priority: 7,
        });
      }
    }
  }

  const gaps = detectTripGaps(args.transportReservations as Parameters<typeof detectTripGaps>[0]);
  for (const gap of gaps) {
    if (gap.severity === "info") continue;
    if (gap.actionLabel?.toLowerCase().includes("hotel") && seenHotels.size > 0) continue;
    const priority =
      gap.severity === "critical" ? 3 : gap.severity === "warning" ? 16 : 20;
    const action = gapToAction(gap, priority);
    if (action && !items.some((item) => item.label === action.label)) {
      items.push(action);
    }
  }

  return items.sort((a, b) => a.priority - b.priority).slice(0, 6);
}
