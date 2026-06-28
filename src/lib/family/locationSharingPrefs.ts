/** User must explicitly opt out — sharing stays on by default across sessions. */
export const FAMILY_SHARING_OPT_OUT_KEY = "kepi:family-sharing-off";

/** @deprecated Legacy opt-in flag — migrated to opt-out model on read. */
export const FAMILY_SHARING_LEGACY_OPT_IN_KEY = "kepi:family-sharing-active";

export function isFamilySharingOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FAMILY_SHARING_OPT_OUT_KEY) === "1";
}

/** True when the user has not explicitly stopped sharing (default on). */
export function isFamilySharingActive(): boolean {
  return !isFamilySharingOptedOut();
}

export function setFamilySharingOptedOut(optedOut: boolean): void {
  if (typeof window === "undefined") return;
  if (optedOut) {
    window.localStorage.setItem(FAMILY_SHARING_OPT_OUT_KEY, "1");
    window.localStorage.removeItem(FAMILY_SHARING_LEGACY_OPT_IN_KEY);
  } else {
    window.localStorage.removeItem(FAMILY_SHARING_OPT_OUT_KEY);
    window.localStorage.setItem(FAMILY_SHARING_LEGACY_OPT_IN_KEY, "1");
  }
}

/** One-time: prior builds wrongly persisted opt-out on GPS permission errors. */
const SHARING_ACCIDENTAL_OPTOUT_REPAIR_KEY = "kepi:family-sharing-accidental-optout-repair-v1";

export function repairAccidentalSharingOptOut(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SHARING_ACCIDENTAL_OPTOUT_REPAIR_KEY)) return;
  window.localStorage.setItem(SHARING_ACCIDENTAL_OPTOUT_REPAIR_KEY, "1");
  if (window.localStorage.getItem(FAMILY_SHARING_OPT_OUT_KEY) === "1") {
    window.localStorage.removeItem(FAMILY_SHARING_OPT_OUT_KEY);
    window.localStorage.setItem(FAMILY_SHARING_LEGACY_OPT_IN_KEY, "1");
  }
}

/** Migrate old installs that never set the legacy opt-in key. */
export function ensureDefaultFamilySharingOn(): void {
  if (typeof window === "undefined") return;
  repairAccidentalSharingOptOut();
  if (isFamilySharingOptedOut()) return;
  if (!window.localStorage.getItem(FAMILY_SHARING_LEGACY_OPT_IN_KEY)) {
    window.localStorage.setItem(FAMILY_SHARING_LEGACY_OPT_IN_KEY, "1");
  }
}

export function dispatchFamilySharingStarted(): void {
  window.dispatchEvent(new CustomEvent("kepi:family-start-sharing"));
}

export function dispatchFamilySharingStopped(): void {
  window.dispatchEvent(new CustomEvent("kepi:family-stop-sharing"));
}
