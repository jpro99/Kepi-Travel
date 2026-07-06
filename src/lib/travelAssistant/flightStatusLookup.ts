import { logger } from "@/lib/logger";
import { fetchAeroDataBoxFlightSnapshot } from "@/lib/travelAssistant/flightStatusSources/aeroDataBoxSource";
import { fetchFlightAwareFlightSnapshot } from "@/lib/travelAssistant/flightStatusSources/flightAwareSource";
import {
  mergeFlightStatusSnapshots,
  snapshotToUpdateKind,
  type MergedFlightStatusSnapshot,
} from "@/lib/travelAssistant/flightStatusMerge";

export async function fetchMergedFlightStatusSnapshot(input: {
  flightNumber: string;
  flightDate: string;
  nowMs?: number;
}): Promise<MergedFlightStatusSnapshot | null> {
  const nowMs = input.nowMs ?? Date.now();
  const [aero, flightAware] = await Promise.all([
    fetchAeroDataBoxFlightSnapshot({ ...input, nowMs }),
    fetchFlightAwareFlightSnapshot({ ...input, nowMs }),
  ]);
  const merged = mergeFlightStatusSnapshots([aero, flightAware].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
  if (merged && merged.discrepancies.length > 0) {
    logger.info("Flight status source discrepancy detected.", {
      scope: "travelAssistant/flightStatusLookup",
      flightNumber: merged.flightNumber,
      flightDate: merged.flightDate,
      mergedFrom: merged.mergedFrom,
      discrepancies: merged.discrepancies,
    });
  }
  return merged;
}

export { snapshotToUpdateKind };
