import type {
  FlightStatusSnapshot,
  FlightStatusSourceDiscrepancy,
  FlightStatusSourceId,
} from "@/lib/travelAssistant/flightStatusSnapshot";

export interface MergedFlightStatusSnapshot extends FlightStatusSnapshot {
  mergedFrom: FlightStatusSourceId[];
  discrepancies: FlightStatusSourceDiscrepancy[];
}

function compareField(
  field: string,
  left: FlightStatusSnapshot,
  right: FlightStatusSnapshot,
): FlightStatusSourceDiscrepancy | null {
  const leftValue =
    field === "status"
      ? left.status
      : field === "delayMinutes"
        ? String(left.delayMinutes ?? "")
        : field === "departureGate"
          ? left.departureGate
          : left.departureTerminal;
  const rightValue =
    field === "status"
      ? right.status
      : field === "delayMinutes"
        ? String(right.delayMinutes ?? "")
        : field === "departureGate"
          ? right.departureGate
          : right.departureTerminal;
  if (!leftValue || !rightValue || leftValue === rightValue) return null;
  return {
    field,
    primary: leftValue,
    secondary: rightValue,
    primarySource: left.source,
    secondarySource: right.source,
  };
}

function pickAuthoritativeSnapshot(
  snapshots: FlightStatusSnapshot[],
): FlightStatusSnapshot {
  return [...snapshots].sort((left, right) => {
    if (right.authorityRank !== left.authorityRank) {
      return right.authorityRank - left.authorityRank;
    }
    return right.fetchedAtMs - left.fetchedAtMs;
  })[0]!;
}

export function mergeFlightStatusSnapshots(
  snapshots: FlightStatusSnapshot[],
): MergedFlightStatusSnapshot | null {
  const usable = snapshots.filter(Boolean);
  if (usable.length === 0) return null;
  const authoritative = pickAuthoritativeSnapshot(usable);
  const secondary = usable.filter((entry) => entry.source !== authoritative.source);
  const discrepancies: FlightStatusSourceDiscrepancy[] = [];
  for (const candidate of secondary) {
    for (const field of ["status", "delayMinutes", "departureGate", "departureTerminal"] as const) {
      const mismatch = compareField(field, authoritative, candidate);
      if (mismatch) discrepancies.push(mismatch);
    }
  }
  return {
    ...authoritative,
    mergedFrom: usable.map((entry) => entry.source),
    discrepancies,
  };
}

export function snapshotToUpdateKind(
  snapshot: FlightStatusSnapshot,
): "on-time" | "delay" | "cancellation" {
  const status = snapshot.status.toLowerCase();
  if (status.includes("cancel")) return "cancellation";
  if (status.includes("delay") || (snapshot.delayMinutes ?? 0) >= 15) return "delay";
  return "on-time";
}
