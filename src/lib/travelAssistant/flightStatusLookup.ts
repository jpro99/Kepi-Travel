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

export interface FlightLookupResponseBody {
  flightNumber: string;
  airline: string;
  flightDate: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  departureTerminal: string;
  departureGate: string;
  arrivalTerminal: string;
  arrivalGate: string;
  delayMinutes: number | null;
  onTime: boolean | null;
  flightStatus: string;
  mergedFrom?: string[];
  sourceDiscrepancies?: number;
}

function mapSnapshotStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("divert")) return "diverted";
  if (normalized.includes("delay")) return "delayed";
  if (normalized.includes("enroute") || normalized.includes("depart") || normalized.includes("approach")) {
    return "active";
  }
  if (normalized.includes("arriv") || normalized.includes("land")) return "landed";
  if (normalized.includes("board") || normalized.includes("gate")) return "boarding";
  if (normalized.includes("sched")) return "scheduled";
  return status || "unknown";
}

export function mergedSnapshotToFlightLookupResponse(
  merged: MergedFlightStatusSnapshot,
  airline: string,
): FlightLookupResponseBody {
  const delayMinutes = merged.delayMinutes;
  return {
    flightNumber: merged.flightNumber,
    airline,
    flightDate: merged.flightDate,
    departureAirport: merged.departureAirport,
    arrivalAirport: merged.arrivalAirport,
    departureTime: "",
    arrivalTime: "",
    departureTerminal: merged.departureTerminal,
    departureGate: merged.departureGate,
    arrivalTerminal: "",
    arrivalGate: "",
    delayMinutes,
    onTime: delayMinutes === null ? null : delayMinutes <= 0,
    flightStatus: mapSnapshotStatus(merged.status),
    mergedFrom: merged.mergedFrom,
    sourceDiscrepancies: merged.discrepancies.length,
  };
}

export { snapshotToUpdateKind };
