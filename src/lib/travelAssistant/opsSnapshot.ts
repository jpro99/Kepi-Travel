import { readTravelBackgroundRunState } from "@/lib/travelAssistant/backgroundRunStateStore";
import { readTravelOpsActionAuditSnapshot } from "@/lib/travelAssistant/opsActionAuditStore";
import {
  evaluateTravelOpsHealthPolicy,
  evaluateTravelStatusGovernance,
} from "@/lib/travelAssistant/safetyPolicy";
import { readTravelUpdateAuditSnapshot } from "@/lib/travelAssistant/updateAuditStore";
import { readTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type { TravelOpsSnapshot } from "@/lib/travelAssistant/travelUpdateTypes";

const DEFAULT_STALE_MINUTES_YELLOW = 10;
const DEFAULT_STALE_MINUTES_RED = 30;
const DEFAULT_WORKER_DEADMAN_YELLOW_MINUTES = 20;
const DEFAULT_WORKER_DEADMAN_RED_MINUTES = 60;

function parsePositiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

export async function buildTravelOpsSnapshot({
  nowIso,
  auditLimit = 20,
  runtimeStatePath,
  auditPath,
  backgroundStatePath,
  opsAuditPath,
}: {
  nowIso?: string;
  auditLimit?: number;
  runtimeStatePath?: string;
  auditPath?: string;
  backgroundStatePath?: string;
  opsAuditPath?: string;
} = {}): Promise<TravelOpsSnapshot> {
  const generatedAt = nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(generatedAt);

  const [runtime, audit, backgroundState, opsActions] = await Promise.all([
    readTravelRuntimeState(runtimeStatePath),
    readTravelUpdateAuditSnapshot({ limit: auditLimit, storagePath: auditPath }),
    readTravelBackgroundRunState(backgroundStatePath),
    readTravelOpsActionAuditSnapshot({ limit: auditLimit, storagePath: opsAuditPath }),
  ]);

  const runtimeUpdatedMs = Date.parse(runtime.updatedAt);
  const staleMinutesRaw = Number.isNaN(runtimeUpdatedMs)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.round((nowMs - runtimeUpdatedMs) / 60000));
  const staleMinutes = Number.isFinite(staleMinutesRaw) ? staleMinutesRaw : 999999;
  const isStale = staleMinutes >= DEFAULT_STALE_MINUTES_YELLOW;

  const recentErrorCount = audit.recentAuditTrail.filter((entry) => entry.providerError).length;
  const circuitOpenCount = audit.recentAuditTrail.filter((entry) => entry.circuitOpen).length;
  const latestBackgroundRun = audit.recentAuditTrail.find((entry) => entry.source === "background") ?? null;

  const policy = evaluateTravelOpsHealthPolicy({
    runtimeReservationCount: runtime.reservations.length,
    auditTrailCount: audit.recentAuditTrail.length,
    staleMinutes,
    recentErrorCount,
    circuitOpenCount,
    backgroundRunActive: backgroundState.activeRun !== null,
    backgroundRunStartedAt: backgroundState.activeRun?.startedAt ?? null,
    backgroundRunTimeoutMs: backgroundState.activeRun?.timeoutMs ?? null,
    backgroundRunLastStatus: backgroundState.lastRun?.status ?? null,
    backgroundConsecutiveFailures: backgroundState.heartbeat.consecutiveFailures,
    backgroundLastSuccessfulRunAt: backgroundState.heartbeat.lastSuccessfulRunAt,
    backgroundLastFailureAt: backgroundState.heartbeat.lastFailureAt,
    nowMs,
    staleMinutesYellow: DEFAULT_STALE_MINUTES_YELLOW,
    staleMinutesRed: DEFAULT_STALE_MINUTES_RED,
    workerDeadmanYellowMinutes: parsePositiveIntFromEnv(
      "TRAVEL_UPDATE_WORKER_DEADMAN_YELLOW_MINUTES",
      DEFAULT_WORKER_DEADMAN_YELLOW_MINUTES,
    ),
    workerDeadmanRedMinutes: parsePositiveIntFromEnv(
      "TRAVEL_UPDATE_WORKER_DEADMAN_RED_MINUTES",
      DEFAULT_WORKER_DEADMAN_RED_MINUTES,
    ),
  });
  const workerReason = policy.worker.reasons[0] ?? "Background worker unhealthy.";
  const governance = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: isStale,
    runtimeSnapshotStaleMinutes: staleMinutes,
    backgroundRunActive: backgroundState.activeRun !== null,
    backgroundRunLastStatus: backgroundState.lastRun?.status ?? null,
    backgroundWorkerHealth: policy.worker.health,
    backgroundWorkerReason: workerReason,
  });
  
  return {
    generatedAt,
    health: policy.health,
    reasons: policy.reasons,
    governance,
    runtime: {
      mode: runtime.mode,
      updatedAt: runtime.updatedAt,
      reservationCount: runtime.reservations.length,
      staleMinutes,
      isStale,
    },
    audit,
    latestBackgroundRun,
    backgroundState,
    worker: policy.worker,
    opsActions,
    provider: {
      recentErrorCount,
      circuitOpenCount,
    },
  };
}
