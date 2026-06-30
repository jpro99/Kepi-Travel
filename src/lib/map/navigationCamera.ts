/** Shortest signed delta between two compass headings (degrees). */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/** Exponential smoothing for compass heading with dead zone to stop micro-jitter. */
export function smoothAngleDegrees(
  prev: number,
  next: number,
  alpha = 0.18,
  deadZoneDeg = 3,
): number {
  const delta = shortestAngleDelta(prev, next);
  if (Math.abs(delta) < deadZoneDeg) return prev;
  const value = prev + delta * alpha;
  return ((value % 360) + 360) % 360;
}

/** Exponential smoothing for lat/lon during follow mode. */
export function smoothScalar(prev: number, next: number, alpha = 0.35): number {
  return prev + (next - prev) * alpha;
}

/** Faster catch-up when the GPS fix is farther from the smoothed camera. */
export function smoothFollowCoordinate(prev: number, next: number): number {
  const delta = Math.abs(next - prev);
  const alpha = delta > 0.00025 ? 0.82 : delta > 0.00008 ? 0.62 : 0.38;
  return smoothScalar(prev, next, alpha);
}

export interface FollowCameraState {
  lat: number | null;
  lon: number | null;
  heading: number;
  targetLat: number | null;
  targetLon: number | null;
  targetHeading: number;
  zoom: number;
}

export function createFollowCameraState(zoom = 17): FollowCameraState {
  return {
    lat: null,
    lon: null,
    heading: 0,
    targetLat: null,
    targetLon: null,
    targetHeading: 0,
    zoom,
  };
}

export function pushFollowTarget(
  state: FollowCameraState,
  patch: { lat?: number; lon?: number; heading?: number },
): void {
  if (patch.lat != null && patch.lon != null) {
    state.targetLat = patch.lat;
    state.targetLon = patch.lon;
    if (state.lat == null) {
      state.lat = patch.lat;
      state.lon = patch.lon;
    }
  }
  if (patch.heading != null) {
    state.targetHeading = patch.heading;
    if (state.lat == null) {
      state.heading = patch.heading;
    }
  }
}

/** Advance smoothed camera state one frame toward targets. */
export function stepFollowCamera(state: FollowCameraState): boolean {
  let moved = false;
  if (state.targetLat != null && state.targetLon != null && state.lat != null && state.lon != null) {
    const nextLat = smoothFollowCoordinate(state.lat, state.targetLat);
    const nextLon = smoothFollowCoordinate(state.lon, state.targetLon);
    if (Math.abs(nextLat - state.lat) > 1e-8 || Math.abs(nextLon - state.lon) > 1e-8) {
      moved = true;
    }
    state.lat = nextLat;
    state.lon = nextLon;
  }
  const prevHeading = state.heading;
  state.heading = smoothAngleDegrees(state.heading, state.targetHeading, 0.16, 4);
  if (Math.abs(shortestAngleDelta(prevHeading, state.heading)) > 0.25) {
    moved = true;
  }
  return moved;
}
