/** Fired when the airport navigator walk/route sheet opens or closes. */
export const AIRPORT_WALK_SHEET_EVENT = "kepi:airport-walk-sheet";

export function setAirportWalkSheetOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AIRPORT_WALK_SHEET_EVENT, { detail: { open } }));
}
