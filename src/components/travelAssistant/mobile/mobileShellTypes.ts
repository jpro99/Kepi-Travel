export type MobilePrimaryTab = "home" | "map" | "trip" | "plan" | "more";

export const MOBILE_PRIMARY_TABS: Array<{ id: MobilePrimaryTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "map", label: "Map" },
  { id: "trip", label: "Trip" },
  { id: "plan", label: "Plan" },
  { id: "more", label: "More" },
];

const LEGACY_MOBILE_TAB_ALIASES: Record<string, MobilePrimaryTab> = {
  planning: "plan",
  plan: "plan",
  itinerary: "plan",
  flights: "trip",
  hotels: "trip",
  trips: "trip",
  assist: "home",
  settings: "more",
};

export function isMobilePrimaryTab(value: string | null): value is MobilePrimaryTab {
  return MOBILE_PRIMARY_TABS.some((tab) => tab.id === value);
}

export function normalizeMobilePrimaryTab(value: string | null): MobilePrimaryTab | null {
  if (!value) return null;
  if (isMobilePrimaryTab(value)) return value;
  return LEGACY_MOBILE_TAB_ALIASES[value] ?? null;
}
