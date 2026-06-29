export type MobilePrimaryTab = "trips" | "map" | "assist" | "plan";

export type MobileTripsSegment = "flights" | "hotels" | "tickets";

export const MOBILE_PRIMARY_TABS: Array<{ id: MobilePrimaryTab; label: string }> = [
  { id: "trips", label: "Trips" },
  { id: "map", label: "Map" },
  { id: "assist", label: "Assist" },
  { id: "plan", label: "Plan" },
];

export const MOBILE_TRIPS_SEGMENTS: Array<{ id: MobileTripsSegment; label: string }> = [
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "tickets", label: "Tickets" },
];

export function isMobilePrimaryTab(value: string | null): value is MobilePrimaryTab {
  return MOBILE_PRIMARY_TABS.some((tab) => tab.id === value);
}

export function isMobileTripsSegment(value: string | null): value is MobileTripsSegment {
  return MOBILE_TRIPS_SEGMENTS.some((segment) => segment.id === value);
}
