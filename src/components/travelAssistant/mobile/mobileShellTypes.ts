export type MobilePrimaryTab = "home" | "plan" | "book" | "map" | "photos" | "more";

/** Same mental model as desktop: Home → Plan → Book → Map → Photos → More */
export const MOBILE_PRIMARY_TABS: Array<{ id: MobilePrimaryTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "plan", label: "Plan" },
  { id: "book", label: "Book" },
  { id: "map", label: "Map" },
  { id: "photos", label: "Photos" },
  { id: "more", label: "More" },
];

const LEGACY_MOBILE_TAB_ALIASES: Record<string, MobilePrimaryTab> = {
  planning: "plan",
  plan: "plan",
  itinerary: "plan",
  trip: "book",
  trips: "book",
  flights: "book",
  hotels: "book",
  assist: "home",
  settings: "more",
  memories: "photos",
};

export function isMobilePrimaryTab(value: string | null): value is MobilePrimaryTab {
  return MOBILE_PRIMARY_TABS.some((tab) => tab.id === value);
}

export function normalizeMobilePrimaryTab(value: string | null): MobilePrimaryTab | null {
  if (!value) return null;
  if (isMobilePrimaryTab(value)) return value;
  return LEGACY_MOBILE_TAB_ALIASES[value] ?? null;
}
