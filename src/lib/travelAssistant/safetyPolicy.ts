import type {
  TravelBackgroundWorkerHealth,
  TravelBackgroundRunStatus,
  TravelExecutionStatus,
  TravelOpsHealthStatus,
  TravelOpsWorkerStatus,
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
  backgroundWorkerHealth?: TravelBackgroundWorkerHealth;
  backgroundWorkerReason?: string;
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
  backgroundConsecutiveFailures: number;
  backgroundLastSuccessfulRunAt: string | null;
  backgroundLastFailureAt: string | null;
  nowMs: number;
  staleMinutesYellow?: number;
  staleMinutesRed?: number;
  workerDeadmanYellowMinutes?: number;
  workerDeadmanRedMinutes?: number;
  scheduleIntervalMinutes?: number;
  scheduleJitterMinutes?: number;
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

  if (input.backgroundWorkerHealth === "unhealthy") {
    addBlocker(blockers, {
      code: "background-worker-unhealthy",
      source: "background",
      minimumStatus: "red",
      reason: input.backgroundWorkerReason ?? "Background worker health is unhealthy.",
      remediation: "Restore worker heartbeat with a successful managed background run.",
    });
  }

  const minimumStatus = pickMinimumStatus(blockers.map((item) => item.minimumStatus));
  return {
    greenAllowed: blockers.length === 0,
    minimumStatus,
    blockers,
  };
}

export function evaluateBackgroundWorkerHealth({
  backgroundRunActive,
  backgroundRunStartedAt,
  backgroundRunTimeoutMs,
  backgroundRunLastStatus,
  backgroundConsecutiveFailures,
  backgroundLastSuccessfulRunAt,
  backgroundLastFailureAt,
  nowMs,
  workerDeadmanYellowMinutes = 20,
  workerDeadmanRedMinutes = 60,
  scheduleIntervalMinutes = 5,
  scheduleJitterMinutes = 2,
}: {
  backgroundRunActive: boolean;
  backgroundRunStartedAt: string | null;
  backgroundRunTimeoutMs: number | null;
  backgroundRunLastStatus: TravelBackgroundRunStatus | null;
  backgroundConsecutiveFailures: number;
  backgroundLastSuccessfulRunAt: string | null;
  backgroundLastFailureAt: string | null;
  nowMs: number;
  workerDeadmanYellowMinutes?: number;
  workerDeadmanRedMinutes?: number;
  scheduleIntervalMinutes?: number;
  scheduleJitterMinutes?: number;
}): TravelOpsWorkerStatus {
  const reasons: string[] = [];
  let health: TravelBackgroundWorkerHealth = "healthy";
  const yellowMinutes = Math.max(1, workerDeadmanYellowMinutes);
  const redMinutes = Math.max(yellowMinutes + 1, workerDeadmanRedMinutes);
  const scheduleMinutes = Math.max(1, scheduleIntervalMinutes);
  const jitterMinutes = Math.max(0, scheduleJitterMinutes);
  const lastSuccessMs = backgroundLastSuccessfulRunAt ? Date.parse(backgroundLastSuccessfulRunAt) : Number.NaN;
  const minutesSinceLastSuccess = Number.isNaN(lastSuccessMs)
    ? null
    : Math.max(0, Math.round((nowMs - lastSuccessMs) / 60000));
  const missedHeartbeat = minutesSinceLastSuccess !== null && minutesSinceLastSuccess >= yellowMinutes;
  const expectedNextRunMs = Number.isNaN(lastSuccessMs)
    ? Number.NaN
    : lastSuccessMs + (scheduleMinutes + jitterMinutes) * 60_000;
  const expectedNextRunBy = Number.isNaN(expectedNextRunMs) ? null : new Date(expectedNextRunMs).toISOString();
  const minutesUntilExpectedRun = Number.isNaN(expectedNextRunMs)
    ? null
    : Math.round((expectedNextRunMs - nowMs) / 60000);
  const missedSchedule = minutesUntilExpectedRun !== null && minutesUntilExpectedRun < 0;

  if (backgroundRunActive) {
    const startedAtMs = backgroundRunStartedAt ? Date.parse(backgroundRunStartedAt) : Number.NaN;
    const runningMs = Number.isNaN(startedAtMs) ? 0 : nowMs - startedAtMs;
    const timeoutMs = backgroundRunTimeoutMs ?? 0;
    if (timeoutMs > 0 && runningMs > timeoutMs + 10_000) {
      health = "unhealthy";
      reasons.push("Background run appears stuck beyond configured timeout.");
    } else {
      if (health === "healthy") {
        health = "degraded";
      }
      reasons.push("Background run currently in progress.");
    }
  }

  if (backgroundConsecutiveFailures >= 3) {
    health = "unhealthy";
    reasons.push(`Background worker has ${backgroundConsecutiveFailures} consecutive failures.`);
  } else if (backgroundConsecutiveFailures > 0 && health === "healthy") {
    health = "degraded";
    reasons.push(`Background worker has ${backgroundConsecutiveFailures} consecutive failure(s).`);
  }

  if (minutesSinceLastSuccess === null) {
    if (health !== "unhealthy") {
      health = "degraded";
    }
    reasons.push("No successful background run heartbeat recorded yet.");
  } else if (minutesSinceLastSuccess >= redMinutes) {
    health = "unhealthy";
    reasons.push(`Background worker heartbeat stale for ${minutesSinceLastSuccess} minutes.`);
  } else if (minutesSinceLastSuccess >= yellowMinutes && health === "healthy") {
    health = "degraded";
    reasons.push(`Background worker heartbeat approaching stale threshold (${minutesSinceLastSuccess} minutes).`);
  }

  if (missedSchedule) {
    if ((minutesUntilExpectedRun ?? 0) <= -Math.max(3, scheduleMinutes * 2)) {
      health = "unhealthy";
      reasons.push(
        `Background run schedule missed by ${Math.abs(minutesUntilExpectedRun ?? 0)} minutes (expected every ${scheduleMinutes}m).`,
      );
    } else if (health === "healthy") {
      health = "degraded";
      reasons.push(
        `Background run behind expected schedule by ${Math.abs(minutesUntilExpectedRun ?? 0)} minutes.`,
      );
    }
  }

  if (backgroundRunLastStatus === "timeout" || backgroundRunLastStatus === "failed") {
    if (health === "healthy") {
      health = "degraded";
    }
    reasons.push(`Last background run status: ${backgroundRunLastStatus}.`);
  }

  if (reasons.length === 0) {
    reasons.push("Background worker healthy.");
  }

  return {
    health,
    reasons,
    lastSuccessfulRunAt: backgroundLastSuccessfulRunAt,
    lastFailureAt: backgroundLastFailureAt,
    consecutiveFailures: backgroundConsecutiveFailures,
    minutesSinceLastSuccess,
    missedHeartbeat,
    expectedNextRunBy,
    minutesUntilExpectedRun,
    scheduleIntervalMinutes: scheduleMinutes,
    scheduleJitterMinutes: jitterMinutes,
    missedSchedule,
  };
}

export function evaluateTravelOpsHealthPolicy(input: TravelOpsHealthPolicyInput): {
  health: TravelOpsHealthStatus;
  reasons: string[];
  worker: TravelOpsWorkerStatus;
} {
  const staleMinutesYellow = Math.max(1, input.staleMinutesYellow ?? 10);
  const staleMinutesRed = Math.max(staleMinutesYellow + 1, input.staleMinutesRed ?? 30);
  const reasons: string[] = [];
  let health: TravelOpsHealthStatus = "green";
  const worker = evaluateBackgroundWorkerHealth({
    backgroundRunActive: input.backgroundRunActive,
    backgroundRunStartedAt: input.backgroundRunStartedAt,
    backgroundRunTimeoutMs: input.backgroundRunTimeoutMs,
    backgroundRunLastStatus: input.backgroundRunLastStatus,
    backgroundConsecutiveFailures: input.backgroundConsecutiveFailures,
    backgroundLastSuccessfulRunAt: input.backgroundLastSuccessfulRunAt,
    backgroundLastFailureAt: input.backgroundLastFailureAt,
    nowMs: input.nowMs,
    workerDeadmanYellowMinutes: input.workerDeadmanYellowMinutes,
    workerDeadmanRedMinutes: input.workerDeadmanRedMinutes,
    scheduleIntervalMinutes: input.scheduleIntervalMinutes,
    scheduleJitterMinutes: input.scheduleJitterMinutes,
  });

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

  if (worker.health === "unhealthy") {
    health = "red";
    reasons.push(`Worker unhealthy: ${worker.reasons[0]}`);
  } else if (worker.health === "degraded") {
    if (health !== "red") health = "yellow";
    reasons.push(`Worker degraded: ${worker.reasons[0]}`);
  }

  if (reasons.length === 0) {
    reasons.push("All checks healthy.");
  }

  return { health, reasons, worker };
}

export function enforceStatusFloor(
  desired: TravelExecutionStatus,
  governance: TravelStatusGovernance,
): TravelExecutionStatus {
  return STATUS_ORDER[desired] < STATUS_ORDER[governance.minimumStatus] ? governance.minimumStatus : desired;
}
