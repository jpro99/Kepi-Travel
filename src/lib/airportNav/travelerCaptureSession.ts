const IATA_KEY = "kepi:traveler-capture-iata:v1";
const TRIP_KEY = "kepi:traveler-capture-trip:v1";

export type CaptureLocationStatus = "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage may be blocked
  }
}

export function getConfirmedCaptureIata(): string | null {
  const raw = readSession(IATA_KEY);
  if (!raw) return null;
  const iata = raw.toUpperCase();
  return /^[A-Z]{3}$/.test(iata) ? iata : null;
}

export function setConfirmedCaptureIata(iata: string): void {
  const code = iata.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) writeSession(IATA_KEY, code);
}

export function getPersistedCaptureTripId(): string | null {
  return readSession(TRIP_KEY);
}

export function persistCaptureTripId(tripId: string | null | undefined): void {
  const id = tripId?.trim();
  if (id) writeSession(TRIP_KEY, id);
}

export function shouldShowTravelerCapture(input: {
  locationStatus?: CaptureLocationStatus | string | null;
  confirmedIata?: string | null;
}): boolean {
  const status = input.locationStatus ?? "unknown";
  if (status === "at-airport" || status === "in-terminal") return true;
  return Boolean(input.confirmedIata?.trim());
}

export function resolveCaptureIata(input: {
  locationStatus?: CaptureLocationStatus | string | null;
  nearestAirport?: string | null;
  confirmedIata?: string | null;
  plannableIata?: string | null;
}): string | null {
  const status = input.locationStatus ?? "unknown";
  if (status === "at-airport" || status === "in-terminal") {
    return (
      input.nearestAirport?.trim().toUpperCase() ||
      input.confirmedIata?.trim().toUpperCase() ||
      input.plannableIata?.trim().toUpperCase() ||
      null
    );
  }
  const confirmed = input.confirmedIata?.trim().toUpperCase();
  return confirmed && /^[A-Z]{3}$/.test(confirmed) ? confirmed : null;
}

export function resolveCaptureTripId(input: {
  activeTripId?: string | null;
  urlTripId?: string | null;
  persistedTripId?: string | null;
}): string | null {
  return (
    input.activeTripId?.trim() ||
    input.urlTripId?.trim() ||
    input.persistedTripId?.trim() ||
    null
  );
}
