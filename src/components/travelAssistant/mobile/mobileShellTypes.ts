export type MobilePrimaryTab = "home" | "plan" | "book" | "map" | "photos" | "more";

/**
 * Matches MobileTabBar DOM: pt-2 + min-h 68px row + max(0.625rem, safe-area).
 * Use for padding-bottom on scroll content and bottom offsets for fixed UI.
 */
export const MOBILE_TAB_BAR_CLEARANCE =
  "calc(68px + 0.5rem + max(0.625rem, env(safe-area-inset-bottom)))";

/** Scrollable mobile content padding above the portaled tab bar. */
export const MOBILE_CONTENT_BOTTOM_PAD = `calc(${MOBILE_TAB_BAR_CLEARANCE} + 1rem)`;

/** Fixed toast / FAB offset above the tab bar. */
export const MOBILE_FLOATING_ABOVE_TAB_BAR = `calc(${MOBILE_TAB_BAR_CLEARANCE} + 0.75rem)`;

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
