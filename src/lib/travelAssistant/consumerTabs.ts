/** Bottom-nav and orientation card tabs in the travel assistant consumer shell. */
export type ConsumerTab = "trip" | "itinerary" | "book" | "map" | "more";

export type BookSubTab = "flights" | "hotels";

export type PlanSubView = "timeline" | "calendar";

export const CONSUMER_TABS: ConsumerTab[] = ["trip", "itinerary", "book", "map", "more"];

/** Tab bar labels/icons — shared by desktop and mobile nav. */
export const CONSUMER_TAB_BAR: ReadonlyArray<readonly [ConsumerTab, string, string]> = [
  ["trip", "Home", "🏠"],
  ["itinerary", "Plan", "📋"],
  ["book", "Book", "🎫"],
  ["map", "Map", "🗺"],
  ["more", "More", "···"],
];

export function isConsumerTab(value: string): value is ConsumerTab {
  return (CONSUMER_TABS as string[]).includes(value);
}

/** Legacy ?tab= values from bookmarks, push links, and old nav. */
export function normalizeConsumerTabParam(tab: string | null): ConsumerTab | null {
  if (!tab) return null;
  if (tab === "calendar") return "itinerary";
  if (tab === "flights" || tab === "hotels") return "book";
  if (isConsumerTab(tab)) return tab;
  return null;
}

export function resolveBookSubTab(tab: string | null, bookView: string | null): BookSubTab {
  if (bookView === "flights" || bookView === "hotels") return bookView;
  if (tab === "hotels") return "hotels";
  return "flights";
}

export function resolvePlanSubView(tab: string | null, planView: string | null): PlanSubView {
  if (planView === "calendar" || planView === "timeline") return planView;
  if (tab === "calendar") return "calendar";
  return "timeline";
}

/** Map extended orientation targets onto consumer nav tabs. */
export function orientationTabToConsumerTab(tab: string): ConsumerTab {
  if (isConsumerTab(tab)) return tab;
  if (tab === "calendar") return "itinerary";
  if (tab === "flights" || tab === "hotels" || tab === "reservations") return "book";
  if (tab === "family" || tab === "packing") return "more";
  return "trip";
}

export function bookSubTabForOrientationTab(tab: string): BookSubTab {
  if (tab === "hotels") return "hotels";
  return "flights";
}
