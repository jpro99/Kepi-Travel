/** Bottom-nav and orientation card tabs in the travel assistant consumer shell. */
export type ConsumerTab = "trip" | "itinerary" | "calendar" | "flights" | "hotels" | "map" | "more";

export const CONSUMER_TABS: ConsumerTab[] = ["trip", "itinerary", "calendar", "flights", "hotels", "map", "more"];

/** Tab bar labels/icons — shared by desktop and mobile nav. */
export const CONSUMER_TAB_BAR: ReadonlyArray<readonly [ConsumerTab, string, string]> = [
  ["trip", "Trip", "✈️"],
  ["itinerary", "Plan", "📋"],
  ["calendar", "Calendar", "🗓"],
  ["flights", "Flights", "🛫"],
  ["hotels", "Hotels", "🏨"],
  ["map", "Map", "🗺"],
  ["more", "More", "···"],
];

export function isConsumerTab(value: string): value is ConsumerTab {
  return (CONSUMER_TABS as string[]).includes(value);
}

/** Map extended orientation targets onto consumer nav tabs. */
export function orientationTabToConsumerTab(tab: string): ConsumerTab {
  if (isConsumerTab(tab)) return tab;
  if (tab === "family" || tab === "packing" || tab === "reservations") return "more";
  return "trip";
}
