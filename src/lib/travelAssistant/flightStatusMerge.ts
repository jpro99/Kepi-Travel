import type {
  FlightStatusSnapshot,
  FlightStatusSourceDiscrepancy,
  FlightStatusSourceId,
} from "@/lib/travelAssistant/flightStatusSnapshot";

export interface MergedFlightStatusSnapshot extends FlightStatusSnapshot {
  mergedFrom: FlightStatusSourceId[];
  discrepancies: FlightStatusSourceDiscrepancy[];
}

function fieldValue(snapshot: FlightStatusSnapshot, field: string): string {
  if (field === "status") return snapshot.status;
  if (field === "delayMinutes") return String(snapshot.delayMinutes ?? "");
  if (field === "departureGate") return snapshot.departureGate;
  if (field === "departureTerminal") return snapshot.departureTerminal;
  if (field === "baggageClaim") return snapshot.baggageClaim;
  return "";
}

function compareField(
  field: string,
  left: FlightStatusSnapshot,
  right: FlightStatusSnapshot,
): FlightStatusSourceDiscrepancy | null {
  const leftValue = fieldValue(left, field);
  const rightValue = fieldValue(right, field);
  if (!leftValue || !rightValue || leftValue === rightValue) return null;
  return {
    field,
    primary: leftValue,
    secondary: rightValue,
    primarySource: left.source,
    secondarySource: right.source,
  };
}

function fillBaggageClaim(
  authoritative: FlightStatusSnapshot,
  snapshots: FlightStatusSnapshot[],
): string {
  if (authoritative.baggageClaim.trim()) return authoritative.baggageClaim.trim();
  for (const entry of snapshots) {
    const claim = entry.baggageClaim.trim();
    if (claim) return claim;
  }
  return "";
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
    for (const field of [
      "status",
      "delayMinutes",
      "departureGate",
      "departureTerminal",
      "baggageClaim",
    ] as const) {
      const mismatch = compareField(field, authoritative, candidate);
      if (mismatch) discrepancies.push(mismatch);
    }
  }
  return {
    ...authoritative,
    baggageClaim: fillBaggageClaim(authoritative, usable),
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
