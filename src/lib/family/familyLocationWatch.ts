import {
  ensureDefaultFamilySharingOn,
  isFamilySharingOptedOut,
  setFamilySharingOptedOut,
} from "@/lib/family/locationSharingPrefs";
import {
  resetGeolocationQualityState,
  resolveLiveCoordinates,
  shouldAcceptGeolocationFix,
} from "@/lib/family/geolocationQuality";

/** Show green / live for 30 minutes — phones pause GPS in background. */
export const FAMILY_LOCATION_STALE_MS = 30 * 60_000;

type LocationSender = (lat: number, lon: number, accuracy?: number) => void | Promise<void>;

let watchId: number | null = null;
let heartbeatId: ReturnType<typeof setInterval> | null = null;
let sender: LocationSender | null = null;
let sending = false;

async function pushLocation(lat: number, lon: number, accuracy?: number): Promise<void> {
  if (!sender || sending) return;
  sending = true;
  try {
    await sender(lat, lon, accuracy);
  } catch {
    /* silent */
  } finally {
    sending = false;
  }
}

function readPosition(pos: GeolocationPosition): void {
  const resolved = resolveLiveCoordinates(pos.coords, pos.timestamp);
  if (!resolved) return;
  void pushLocation(resolved.lat, resolved.lon, resolved.accuracy);
}

export function setFamilyLocationSender(fn: LocationSender | null): void {
  sender = fn;
}

export function isFamilyLocationWatchActive(): boolean {
  return watchId !== null;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 25_000,
};

const BURST_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 18_000,
};

/** Take several high-accuracy samples and keep the best one. */
export function burstFamilyLocationFix(): void {
  if (typeof window === "undefined" || !navigator.geolocation) return;
  if (isFamilySharingOptedOut()) return;

  let best: GeolocationPosition | null = null;
  let attemptsLeft = 3;

  const attempt = (): void => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (
          !best ||
          (pos.coords.accuracy ?? 999) < (best.coords.accuracy ?? 999)
        ) {
          best = pos;
        }
        attemptsLeft -= 1;
        if (attemptsLeft > 0) {
          window.setTimeout(attempt, 900);
          return;
        }
        if (best) readPosition(best);
      },
      () => {
        attemptsLeft -= 1;
        if (attemptsLeft > 0) window.setTimeout(attempt, 900);
        else if (best) readPosition(best);
      },
      BURST_OPTIONS,
    );
  };

  attempt();
}

export function startPersistentFamilyLocationWatch(): void {
  if (typeof window === "undefined" || !navigator.geolocation) return;
  if (isFamilySharingOptedOut()) return;
  ensureDefaultFamilySharingOn();
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    readPosition,
    (err) => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (err.code === 1) {
        setFamilySharingOptedOut(true);
        return;
      }
      window.setTimeout(() => startPersistentFamilyLocationWatch(), 30_000);
    },
    WATCH_OPTIONS,
  );

  if (heartbeatId === null) {
    heartbeatId = window.setInterval(() => {
      if (isFamilySharingOptedOut()) return;
      burstFamilyLocationFix();
    }, 30_000);
  }

  burstFamilyLocationFix();
}

export function stopPersistentFamilyLocationWatch(): void {
  setFamilySharingOptedOut(true);
  resetGeolocationQualityState();
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (heartbeatId !== null) {
    window.clearInterval(heartbeatId);
    heartbeatId = null;
  }
}

export function resumePersistentFamilyLocationWatch(): void {
  setFamilySharingOptedOut(false);
  resetGeolocationQualityState();
  startPersistentFamilyLocationWatch();
}
