import type {
  TravelBackgroundRunStatus,
  TravelExecutionStatus,
  TravelOpsHealthStatus,
  TravelSafetyBlocker,
  TravelStatusGovernance,
} from "@/lib/travelAssistant/travelUpdateTypes";

interface TravelStatusGovernanceInput {
  unresolvedRequiredChecklistCount: number;
  highSeverityTimelineIssueCount: number;
  runtimeSnapshotIsStale: boolean;
  runtimeSnapshotStaleMinutes: number;
  backgroundRunActive: boolean;
  backgroundRunLastStatus: TravelBackgroundRunStatus | null;
}

interface TravelOpsHealthPolicyInput {
  runtimeReservationCount: number;
  auditTrailCount: number;
  staleMinutes: number;
  recentErrorCount: number;
  circuitOpenCount: number;
  backgroundRunActive: boolean;
  backgroundRunStartedAt: string | null;
  backgroundRunTimeoutMs: number | null;
  backgroundRunLastStatus: TravelBackgroundRunStatus | null;
  nowMs: number;
  staleMinutesYellow?: number;
  staleMinutesRed?: number;
}

const STATUS_ORDER: Record<TravelExecutionStatus, number> = {
  green: 1,
  yellow: 2,
  red: 3,
};

function pickMinimumStatus(values: readonly TravelExecutionStatus[]): TravelExecutionStatus {
  return values.reduce<TravelExecutionStatus>((current, candidate) => {
    return STATUS_ORDER[candidate] > STATUS_ORDER[current] ? candidate : current;
  }, "green");
}

function addBlocker(
  blockers: TravelSafetyBlocker[],
  blocker: TravelSafetyBlocker,
): void {
  blockers.push(blocker);
}

export function evaluateTravelStatusGovernance(input: TravelStatusGovernanceInput): TravelStatusGovernance {
  const blockers: TravelSafetyBlocker[] = [];

  if (input.runtimeSnapshotIsStale) {
    addBlocker(blockers, {
      code: "runtime-snapshot-stale",
      source: "runtime",
      minimumStatus: "red",
      reason: `Runtime snapshot is stale (${input.runtimeSnapshotStaleMinutes} minutes).`,
      remediation: "Run sync or trigger background refresh before marking trip on-time.",
    });
  }

  if (input.unresolvedRequiredChecklistCount > 0) {
    addBlocker(blockers, {
      code: "required-readiness-incomplete",
      source: "checklist",
      minimumStatus: "yellow",
      reason: `${input.unresolvedRequiredChecklistCount} required readiness item(s) are unresolved.`,
      remediation: "Complete all required readiness checklist items.",
    });
  }

  if (input.highSeverityTimelineIssueCount > 0) {
    addBlocker(blockers, {
      code: "timeline-high-conflict",
      source: "timeline",
      minimumStatus: "red",
      reason: `${input.highSeverityTimelineIssueCount} high-severity timeline conflict(s) detected.`,
      remediation: "Resolve conflicting times/timezones before allowing on-time status.",
    });
  }

  if (input.backgroundRunActive) {
    addBlocker(blockers, {
      code: "background-run-active",
      source: "background",
      minimumStatus: "yellow",
      reason: "Background synchronization run is still in progress.",
      remediation: "Wait for completion and verify latest background run result.",
    });
  }

  if (
    input.backgroundRunLastStatus === "failed" ||
    input.backgroundRunLastStatus === "timeout" ||
    input.backgroundRunLastStatus === "skipped-overlap"
  ) {
    addBlocker(blockers, {
      code: "background-run-failed",
      source: "background",
      minimumStatus: input.backgroundRunLastStatus === "skipped-overlap" ? "yellow" : "red",
      reason: `Last background run ended with status "${input.backgroundRunLastStatus}".`,
      remediation: "Run a successful background pass before promoting trip to on-time.",
    });
  }

  const minimumStatus = pickMinimumStatus(blockers.map((item) => item.minimumStatus));
  return {
    greenAllowed: blockers.length === 0,
    minimumStatus,
    blockers,
  };
}

export function evaluateTravelOpsHealthPolicy(input: TravelOpsHealthPolicyInput): {
  health: TravelOpsHealthStatus;
  reasons: string[];
} {
  const staleMinutesYellow = Math.max(1, input.staleMinutesYellow ?? 10);
  const staleMinutesRed = Math.max(staleMinutesYellow + 1, input.staleMinutesRed ?? 30);
  const reasons: string[] = [];
  let health: TravelOpsHealthStatus = "green";

  if (input.runtimeReservationCount === 0) {
    health = "red";
    reasons.push("No runtime reservation snapshot available for background updates.");
  }
  if (input.auditTrailCount === 0) {
    if (health !== "red") health = "yellow";
    reasons.push("No recent audit runs recorded yet.");
  }
  if (input.staleMinutes >= staleMinutesRed) {
    health = "red";
    reasons.push(`Runtime snapshot stale for ${input.staleMinutes} minutes.`);
  } else if (input.staleMinutes >= staleMinutesYellow) {
    if (health !== "red") health = "yellow";
    reasons.push(`Runtime snapshot approaching staleness (${input.staleMinutes} minutes).`);
  }
  if (input.circuitOpenCount > 0) {
    health = "red";
    reasons.push(`Provider circuit open detected in ${input.circuitOpenCount} recent run(s).`);
  } else if (input.recentErrorCount > 0) {
    if (health !== "red") health = "yellow";
    reasons.push(`Provider errors observed in ${input.recentErrorCount} recent run(s).`);
  }

  if (input.backgroundRunActive) {
    const startedAtMs = input.backgroundRunStartedAt ? Date.parse(input.backgroundRunStartedAt) : Number.NaN;
    const runningMs = Number.isNaN(startedAtMs) ? 0 : input.nowMs - startedAtMs;
    const timeoutMs = input.backgroundRunTimeoutMs ?? 0;
    if (timeoutMs > 0 && runningMs > timeoutMs + 10_000) {
      health = "red";
      reasons.push("Background run appears stuck beyond configured timeout.");
    } else if (health !== "red") {
      health = "yellow";
      reasons.push("Background run currently in progress.");
    }
  }

  if (input.backgroundRunLastStatus === "failed" || input.backgroundRunLastStatus === "timeout") {
    if (health !== "red") health = "yellow";
    reasons.push(`Last background run status: ${input.backgroundRunLastStatus}.`);
  }

  if (reasons.length === 0) {
    reasons.push("All checks healthy.");
  }

  return { health, reasons };
}

export function enforceStatusFloor(
  desired: TravelExecutionStatus,
  governance: TravelStatusGovernance,
): TravelExecutionStatus {
  return STATUS_ORDER[desired] < STATUS_ORDER[governance.minimumStatus] ? governance.minimumStatus : desired;
}
