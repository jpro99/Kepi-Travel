/** Bottom-nav and orientation card tabs in the travel assistant consumer shell. */
export type ConsumerTab = "trip" | "flights" | "hotels" | "map" | "more";

export const CONSUMER_TABS: ConsumerTab[] = ["trip", "flights", "hotels", "map", "more"];

export function isConsumerTab(value: string): value is ConsumerTab {
  return (CONSUMER_TABS as string[]).includes(value);
}

/** Map extended orientation targets onto consumer nav tabs. */
export function orientationTabToConsumerTab(tab: string): ConsumerTab {
  if (isConsumerTab(tab)) return tab;
  if (tab === "family" || tab === "packing" || tab === "reservations") return "more";
  return "trip";
}
