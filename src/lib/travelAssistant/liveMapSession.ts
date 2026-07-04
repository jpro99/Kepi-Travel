const LIVE_MAP_SESSION_KEY = "kepi:live-map-session";
const LIVE_MAP_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readSessionStartedAt(): number | null {
  try {
    const raw = sessionStorage.getItem(LIVE_MAP_SESSION_KEY);
    if (!raw) return null;
    const startedAt = Number.parseInt(raw, 10);
    return Number.isNaN(startedAt) ? null : startedAt;
  } catch {
    return null;
  }
}

/** User explicitly opened family / live map this browser session. */
export function isLiveMapSessionActive(): boolean {
  const startedAt = readSessionStartedAt();
  if (startedAt == null) return false;
  return Date.now() - startedAt < LIVE_MAP_SESSION_MAX_AGE_MS;
}

export function markLiveMapSessionActive(): void {
  try {
    sessionStorage.setItem(LIVE_MAP_SESSION_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable
  }
}

export function clearLiveMapSession(): void {
  try {
    sessionStorage.removeItem(LIVE_MAP_SESSION_KEY);
  } catch {
    // sessionStorage unavailable
  }
}

export function openLiveMapPath(): string {
  return "/travel-assistant/live-map";
}

/** Call before navigating to /travel-assistant/live-map. */
export function openLiveMap(): void {
  markLiveMapSessionActive();
  window.location.assign(openLiveMapPath());
}

export function leaveLiveMap(homeTab: "home" | "book" = "home"): void {
  clearLiveMapSession();
  try {
    sessionStorage.setItem("kepi:mobile-primary-tab", homeTab);
  } catch {
    // ignore
  }
  window.location.assign(`/travel-assistant?mtab=${encodeURIComponent(homeTab)}`);
}
