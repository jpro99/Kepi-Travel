import { readTravelBackgroundRunState } from "@/lib/travelAssistant/backgroundRunStateStore";
import {
  evaluateTravelOpsHealthPolicy,
  evaluateTravelStatusGovernance,
} from "@/lib/travelAssistant/safetyPolicy";
import { readTravelUpdateAuditSnapshot } from "@/lib/travelAssistant/updateAuditStore";
import { readTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type { TravelOpsSnapshot } from "@/lib/travelAssistant/travelUpdateTypes";

const DEFAULT_STALE_MINUTES_YELLOW = 10;
const DEFAULT_STALE_MINUTES_RED = 30;

export async function buildTravelOpsSnapshot({
  nowIso,
  auditLimit = 20,
  runtimeStatePath,
  auditPath,
  backgroundStatePath,
}: {
  nowIso?: string;
  auditLimit?: number;
  runtimeStatePath?: string;
  auditPath?: string;
  backgroundStatePath?: string;
} = {}): Promise<TravelOpsSnapshot> {
  const generatedAt = nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(generatedAt);

  const [runtime, audit, backgroundState] = await Promise.all([
    readTravelRuntimeState(runtimeStatePath),
    readTravelUpdateAuditSnapshot({ limit: auditLimit, storagePath: auditPath }),
    readTravelBackgroundRunState(backgroundStatePath),
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
  const governance = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: isStale,
    runtimeSnapshotStaleMinutes: staleMinutes,
    backgroundRunActive: backgroundState.activeRun !== null,
    backgroundRunLastStatus: backgroundState.lastRun?.status ?? null,
  });

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
    nowMs,
    staleMinutesYellow: DEFAULT_STALE_MINUTES_YELLOW,
    staleMinutesRed: DEFAULT_STALE_MINUTES_RED,
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
    provider: {
      recentErrorCount,
      circuitOpenCount,
    },
  };
}
