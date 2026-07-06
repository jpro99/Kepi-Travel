/**
 * Aggregate calibration for airport graph edge times and security waits.
 * Learned values never override curated defaults below minimum sample thresholds.
 */

export const MIN_WALK_EDGE_SAMPLES = 5;
export const MIN_SECURITY_WAIT_SAMPLES = 10;
export const OUTLIER_TRIM_FRACTION = 0.15;

export interface EdgeTimingAggregate {
  edgeId: string;
  sampleCount: number;
  medianSeconds: number;
  lowSeconds: number;
  highSeconds: number;
  updatedAt: string;
}

export interface SecurityWaitAggregate {
  laneId: string;
  sampleCount: number;
  medianMinutes: number;
  lowMinutes: number;
  highMinutes: number;
  updatedAt: string;
}

export interface NavTimingCalibrationStore {
  edges: Record<string, EdgeTimingAggregate>;
  securityLanes: Record<string, SecurityWaitAggregate>;
  updatedAt: string;
}

export function createEmptyNavTimingCalibrationStore(): NavTimingCalibrationStore {
  return { edges: {}, securityLanes: {}, updatedAt: new Date().toISOString() };
}

function trimOutliers(values: number[]): number[] {
  if (values.length <= 2) return values;
  const sorted = [...values].sort((left, right) => left - right);
  const trimCount = Math.floor(sorted.length * OUTLIER_TRIM_FRACTION);
  return sorted.slice(trimCount, sorted.length - trimCount || sorted.length);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function spread(values: number[], center: number): { low: number; high: number } {
  if (values.length === 0) return { low: center, high: center };
  const deviations = values.map((value) => Math.abs(value - center)).sort((a, b) => a - b);
  const spreadValue = deviations[Math.floor(deviations.length / 2)] ?? 0;
  return { low: Math.max(0, center - spreadValue), high: center + spreadValue };
}

export function isPlausibleEdgeTraversalSeconds(
  curatedSeconds: number,
  observedSeconds: number,
): boolean {
  if (!Number.isFinite(observedSeconds) || observedSeconds <= 0) return false;
  const min = Math.max(15, curatedSeconds * 0.35);
  const max = curatedSeconds * 4 + 900;
  return observedSeconds >= min && observedSeconds <= max;
}

export function isPlausibleSecurityWaitMinutes(observedMinutes: number): boolean {
  return Number.isFinite(observedMinutes) && observedMinutes >= 2 && observedMinutes <= 120;
}

export function recordEdgeTraversalSample(
  store: NavTimingCalibrationStore,
  edgeId: string,
  curatedSeconds: number,
  observedSeconds: number,
  priorSamples: number[] = [],
): NavTimingCalibrationStore {
  if (!isPlausibleEdgeTraversalSeconds(curatedSeconds, observedSeconds)) {
    return store;
  }
  const samples = trimOutliers([...priorSamples, observedSeconds]);
  const med = median(samples);
  const { low, high } = spread(samples, med);
  return {
    ...store,
    updatedAt: new Date().toISOString(),
    edges: {
      ...store.edges,
      [edgeId]: {
        edgeId,
        sampleCount: samples.length,
        medianSeconds: med,
        lowSeconds: low,
        highSeconds: high,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function recordSecurityWaitSample(
  store: NavTimingCalibrationStore,
  laneId: string,
  observedMinutes: number,
  priorSamples: number[] = [],
): NavTimingCalibrationStore {
  if (!isPlausibleSecurityWaitMinutes(observedMinutes)) {
    return store;
  }
  const samples = trimOutliers([...priorSamples, observedMinutes]);
  const med = median(samples);
  const { low, high } = spread(samples, med);
  return {
    ...store,
    updatedAt: new Date().toISOString(),
    securityLanes: {
      ...store.securityLanes,
      [laneId]: {
        laneId,
        sampleCount: samples.length,
        medianMinutes: med,
        lowMinutes: low,
        highMinutes: high,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export type RouteProfileKind = "sprint" | "default" | "accessible";

export function resolveTraverseSeconds(input: {
  edgeId: string;
  curatedSeconds: number;
  profile: RouteProfileKind;
  aggregate?: EdgeTimingAggregate;
}): number {
  const aggregate = input.aggregate;
  if (!aggregate || aggregate.sampleCount < MIN_WALK_EDGE_SAMPLES) {
    return input.curatedSeconds;
  }
  if (input.profile === "sprint") return aggregate.lowSeconds;
  if (input.profile === "accessible") return aggregate.highSeconds;
  return aggregate.medianSeconds;
}

export function resolveSecurityWaitMinutes(input: {
  laneId: string;
  curatedLow: number;
  curatedHigh: number;
  aggregate?: SecurityWaitAggregate;
}): { low: number; high: number; source: "curated" | "crowd" } {
  const aggregate = input.aggregate;
  if (!aggregate || aggregate.sampleCount < MIN_SECURITY_WAIT_SAMPLES) {
    return { low: input.curatedLow, high: input.curatedHigh, source: "curated" };
  }
  return {
    low: aggregate.lowMinutes,
    high: aggregate.highMinutes,
    source: "crowd",
  };
}

export interface JourneyWaypointEvent {
  id: string;
  tripId: string;
  airportIata: string;
  nodeId: string;
  edgeId?: string;
  phase: string;
  at: number;
}

export function elapsedSecondsBetweenWaypoints(
  previous: JourneyWaypointEvent | null,
  next: JourneyWaypointEvent,
): number | null {
  if (!previous || previous.airportIata !== next.airportIata) return null;
  const deltaMs = next.at - previous.at;
  if (deltaMs <= 0 || deltaMs > 45 * 60 * 1000) return null;
  return Math.round(deltaMs / 1000);
}
