import {
  createEmptyNavTimingCalibrationStore,
  elapsedSecondsBetweenWaypoints,
  recordEdgeTraversalSample,
  recordSecurityWaitSample,
  type JourneyWaypointEvent,
  type NavTimingCalibrationStore,
} from "@/lib/airportNav/navTimingCalibration";
import {
  loadOfflineCacheRecord,
  saveOfflineCacheRecord,
} from "@/lib/travelAssistant/offlineCacheStore";

const CALIBRATION_CACHE_KEY = "nav-timing-calibration:global";

export async function loadNavTimingCalibrationStore(): Promise<NavTimingCalibrationStore> {
  const record = await loadOfflineCacheRecord(CALIBRATION_CACHE_KEY);
  if (!record || typeof record.payload !== "object" || record.payload === null) {
    return createEmptyNavTimingCalibrationStore();
  }
  return record.payload as NavTimingCalibrationStore;
}

export async function saveNavTimingCalibrationStore(
  store: NavTimingCalibrationStore,
): Promise<void> {
  await saveOfflineCacheRecord({
    key: CALIBRATION_CACHE_KEY,
    kind: "airport-layout",
    tripId: "global",
    savedAt: new Date().toISOString(),
    payload: store,
  });
}

export async function recordJourneyWaypointPair(input: {
  previous: JourneyWaypointEvent | null;
  next: JourneyWaypointEvent;
  curatedEdgeSeconds?: number;
  securityLaneId?: string;
}): Promise<NavTimingCalibrationStore> {
  const store = await loadNavTimingCalibrationStore();
  const elapsed = elapsedSecondsBetweenWaypoints(input.previous, input.next);
  if (elapsed === null) return store;

  let nextStore = store;
  if (input.previous?.edgeId && typeof input.curatedEdgeSeconds === "number") {
    const prior = store.edges[input.previous.edgeId]?.sampleCount
      ? Array.from({ length: store.edges[input.previous.edgeId]!.sampleCount }, () =>
          store.edges[input.previous!.edgeId!]!.medianSeconds,
        )
      : [];
    nextStore = recordEdgeTraversalSample(
      nextStore,
      input.previous.edgeId,
      input.curatedEdgeSeconds,
      elapsed,
      prior,
    );
  }

  if (
    input.securityLaneId &&
    input.previous?.phase === "security" &&
    input.next.phase !== "security"
  ) {
    const minutes = Math.round(elapsed / 60);
    nextStore = recordSecurityWaitSample(nextStore, input.securityLaneId, minutes);
  }

  await saveNavTimingCalibrationStore(nextStore);
  return nextStore;
}
