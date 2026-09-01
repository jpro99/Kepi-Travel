/** Fired when the airport navigator walk/route sheet opens or closes. */
export const AIRPORT_WALK_SHEET_EVENT = "kepi:airport-walk-sheet";

/** Fired when traveler "I'm here" confirm mode is active (hides support FAB). */
export const AIRPORT_CONFIRM_SPOT_EVENT = "kepi:airport-confirm-spot";

export function setAirportWalkSheetOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AIRPORT_WALK_SHEET_EVENT, { detail: { open } }));
}

export function setAirportConfirmSpotOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AIRPORT_CONFIRM_SPOT_EVENT, { detail: { open } }));
}
