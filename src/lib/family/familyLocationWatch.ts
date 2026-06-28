import {
  ensureDefaultFamilySharingOn,
  isFamilySharingOptedOut,
  setFamilySharingOptedOut,
} from "@/lib/family/locationSharingPrefs";
import {
  resetGeolocationQualityState,
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
  if (!shouldAcceptGeolocationFix(pos.coords, pos.timestamp)) return;
  void pushLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
}

export function setFamilyLocationSender(fn: LocationSender | null): void {
  sender = fn;
}

export function isFamilyLocationWatchActive(): boolean {
  return watchId !== null;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 30_000,
};

const BURST_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

/** One high-accuracy fix — use after screen unlock or opening Live Map. */
export function burstFamilyLocationFix(): void {
  if (typeof window === "undefined" || !navigator.geolocation) return;
  if (isFamilySharingOptedOut()) return;
  navigator.geolocation.getCurrentPosition(readPosition, () => null, BURST_OPTIONS);
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

  // High-accuracy heartbeat — never fall back to coarse Wi‑Fi/cell guesses.
  if (heartbeatId === null) {
    heartbeatId = window.setInterval(() => {
      if (isFamilySharingOptedOut()) return;
      burstFamilyLocationFix();
    }, 45_000);
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
