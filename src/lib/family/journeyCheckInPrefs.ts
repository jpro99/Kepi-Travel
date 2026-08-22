/**
 * "Journey check-ins" — a self-monitoring opt-in, separate from Family
 * Sharing. Lets Kepi compare YOUR OWN live location against your itinerary
 * (are you near the departure airport when you should be leaving, did you
 * actually arrive) to send you a check-in nudge. Off by default — this is
 * intentionally a distinct consent from sharing your location with family
 * members, per the product decision: someone with no family group, or who
 * doesn't want to share with anyone, can still opt into being watched by
 * the app itself.
 */

const JOURNEY_CHECKIN_OPT_IN_KEY = "kepi:journey-checkin-on";

export function isJourneyCheckInActive(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(JOURNEY_CHECKIN_OPT_IN_KEY) === "1";
}

export function setJourneyCheckInActive(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) {
    window.localStorage.setItem(JOURNEY_CHECKIN_OPT_IN_KEY, "1");
  } else {
    window.localStorage.removeItem(JOURNEY_CHECKIN_OPT_IN_KEY);
  }
}

export function dispatchJourneyCheckInStarted(): void {
  window.dispatchEvent(new CustomEvent("kepi:journey-checkin-start"));
}

export function dispatchJourneyCheckInStopped(): void {
  window.dispatchEvent(new CustomEvent("kepi:journey-checkin-stop"));
}
