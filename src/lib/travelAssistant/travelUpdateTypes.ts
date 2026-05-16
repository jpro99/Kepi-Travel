export type UpdatableReservationType = "flight" | "train" | "ride" | "hotel" | "dinner";
export type TravelUpdateMode = "mock" | "off" | "auto";
export type TravelUpdateKind =
  | "delay"
  | "cancellation"
  | "gate-change"
  | "platform-change"
  | "pickup-change"
  | "on-time";
export type TravelUpdateSeverity = "info" | "warning" | "critical";

export interface UpdatableReservation {
  id: string;
  type: UpdatableReservationType;
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
}

export interface TravelUpdateEvent {
  provider: string;
  kind: TravelUpdateKind;
  severity: TravelUpdateSeverity;
  summary: string;
  detail: string;
  target: {
    reservationType: UpdatableReservationType;
    confirmationCode?: string;
    titleHint?: string;
  };
  delayMinutes?: number;
  updatedLocation?: string;
}

export interface TravelUpdateProvider {
  name: string;
  fetchUpdates(args: {
    reservations: readonly UpdatableReservation[];
    nowIso: string;
  }): Promise<TravelUpdateEvent[]>;
}

export interface TravelUpdateAuditSummary {
  requestId: string;
  checkedAt: string;
  mode: TravelUpdateMode;
  provider: string | null;
  incomingUpdates: number;
  newUpdates: number;
  duplicateUpdates: number;
  totalKnownEvents: number;
}

export interface TravelAuditTrailEntry {
  source: "interactive" | "background";
  requestId: string;
  checkedAt: string;
  mode: TravelUpdateMode;
  provider: string | null;
  incomingUpdates: number;
  newUpdates: number;
  duplicateUpdates: number;
  providerError: string | null;
  circuitOpen: boolean;
  conflictAccepted: number;
  conflictSuppressed: number;
  providerReports: TravelProviderReport[];
}

export interface TravelAuditReadSnapshot {
  totalKnownEvents: number;
  recentAuditTrail: TravelAuditTrailEntry[];
}

export interface TravelUpdateConflict {
  targetKey: string;
  domain: "status" | "timing" | "location";
  winnerProvider: string;
  loserProvider: string;
  winnerKind: TravelUpdateKind;
  loserKind: TravelUpdateKind;
  reason: string;
}

export interface TravelConflictResolutionSummary {
  incomingUpdates: number;
  acceptedUpdates: number;
  suppressedUpdates: number;
  conflicts: TravelUpdateConflict[];
}

export interface TravelProviderReport {
  provider: string;
  attempts: number;
  updateCount: number;
  circuitOpen: boolean;
  error: string | null;
}

export interface TravelUpdateCheckResult {
  mode: TravelUpdateMode;
  provider: string | null;
  updates: TravelUpdateEvent[];
  attempts: number;
  circuitOpen: boolean;
  error: string | null;
  providerReports: TravelProviderReport[];
  audit?: TravelUpdateAuditSummary;
  conflictResolution?: TravelConflictResolutionSummary;
}

export type TravelOpsHealthStatus = "green" | "yellow" | "red";
export type TravelExecutionStatus = "green" | "yellow" | "red";

export interface TravelSafetyBlocker {
  code:
    | "runtime-snapshot-stale"
    | "required-readiness-incomplete"
    | "timeline-high-conflict"
    | "background-run-active"
    | "background-run-failed";
  source: "runtime" | "checklist" | "timeline" | "background";
  minimumStatus: TravelExecutionStatus;
  reason: string;
  remediation: string;
}

export interface TravelStatusGovernance {
  greenAllowed: boolean;
  minimumStatus: TravelExecutionStatus;
  blockers: TravelSafetyBlocker[];
}

export type TravelBackgroundRunStatus =
  | "in-progress"
  | "success"
  | "failed"
  | "timeout"
  | "skipped-overlap";

export interface TravelBackgroundActiveRun {
  runId: string;
  startedAt: string;
  timeoutMs: number;
}

export interface TravelBackgroundLastRun {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: Exclude<TravelBackgroundRunStatus, "in-progress">;
  durationMs: number;
  error: string | null;
  runtimeReservationCount: number;
  newUpdates: number;
  duplicateUpdates: number;
  auditRequestId: string | null;
}

export interface TravelBackgroundRunStateSnapshot {
  activeRun: TravelBackgroundActiveRun | null;
  lastRun: TravelBackgroundLastRun | null;
}

export interface TravelOpsSnapshot {
  generatedAt: string;
  health: TravelOpsHealthStatus;
  reasons: string[];
  governance: TravelStatusGovernance;
  runtime: {
    mode: TravelUpdateMode;
    updatedAt: string;
    reservationCount: number;
    staleMinutes: number;
    isStale: boolean;
  };
  audit: TravelAuditReadSnapshot;
  latestBackgroundRun: TravelAuditTrailEntry | null;
  backgroundState: TravelBackgroundRunStateSnapshot;
  provider: {
    recentErrorCount: number;
    circuitOpenCount: number;
  };
}
