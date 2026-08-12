/**
 * Book → Hotels lead: booked stays first, search only when nights are uncovered.
 * G17 — never open with a search lab when the traveler already has hotels.
 */
export type HotelBookLead = "stays" | "gaps" | "empty";

export function hotelBookLeadMode(input: {
  upcomingStayCount: number;
  nightsNeedingHotel: number;
}): HotelBookLead {
  if (input.upcomingStayCount > 0) return "stays";
  if (input.nightsNeedingHotel > 0) return "gaps";
  return "empty";
}

/** Top-of-tab search launcher — only when there are no stays and nights still need a hotel. */
export function showHotelSearchLauncherAtTop(
  lead: HotelBookLead,
  searchActive: boolean,
): boolean {
  if (searchActive) return false;
  return lead === "gaps";
}
