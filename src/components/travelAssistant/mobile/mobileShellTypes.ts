export type MobilePrimaryTab = "planning" | "itinerary" | "flights" | "hotels" | "settings";

export const MOBILE_PRIMARY_TABS: Array<{ id: MobilePrimaryTab; label: string }> = [
  { id: "planning", label: "Planning" },
  { id: "itinerary", label: "Itinerary" },
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "settings", label: "Settings" },
];

const LEGACY_MOBILE_TAB_ALIASES: Record<string, MobilePrimaryTab> = {
  plan: "planning",
  trips: "flights",
  assist: "planning",
  map: "settings",
};

export function isMobilePrimaryTab(value: string | null): value is MobilePrimaryTab {
  return MOBILE_PRIMARY_TABS.some((tab) => tab.id === value);
}

export function normalizeMobilePrimaryTab(value: string | null): MobilePrimaryTab | null {
  if (!value) return null;
  if (isMobilePrimaryTab(value)) return value;
  return LEGACY_MOBILE_TAB_ALIASES[value] ?? null;
}
