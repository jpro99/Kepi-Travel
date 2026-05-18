"use client";

import type { TravelOpsSnapshot } from "@/lib/travelAssistant/travelUpdateTypes";

type TripStatus = "green" | "yellow" | "red";

interface StatusGovernanceBlocker {
  code: string;
  reason: string;
  remediation: string;
  minimumStatus: TripStatus;
}

interface OpsPanelProps {
  showOpsSection: boolean;
  opsExpanded: boolean;
  onToggleExpanded: () => void;
  opsSnapshot: TravelOpsSnapshot | null;
  opsLoading: boolean;
  opsError: string | null;
  statusBadgeByTripStatus: Record<TripStatus, string>;
  opsActionPending: "run-background-once" | "run-background-dry" | "reset-circuits" | "trigger-alert-sweep" | null;
  onRefreshOps: () => void;
  onRunBackgroundOnce: () => void;
  onRunBackgroundDry: () => void;
  onResetCircuits: () => void;
  onTriggerAlertSweep: () => void;
  formatClock: (value: string | null) => string;
  statusGovernanceBlockers: StatusGovernanceBlocker[];
}

export function OpsPanel({
  showOpsSection,
  opsExpanded,
  onToggleExpanded,
  opsSnapshot,
  opsLoading,
  opsError,
  statusBadgeByTripStatus,
  opsActionPending,
  onRefreshOps,
  onRunBackgroundOnce,
  onRunBackgroundDry,
  onResetCircuits,
  onTriggerAlertSweep,
  formatClock,
  statusGovernanceBlockers,
}: OpsPanelProps) {
  if (!showOpsSection) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
        Ops panel hidden in focus mode for this stage.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={opsExpanded}
        aria-controls="ops-observability-content"
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-900 dark:text-slate-100"
      >
        <span>Ops observability panel</span>
        <span className="text-slate-600 dark:text-slate-400">{opsExpanded ? "Hide" : "Show"}</span>
      </button>
      {opsExpanded ? (
        <div id="ops-observability-content" className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2 py-1 ring-1 ${
                opsSnapshot
                  ? statusBadgeByTripStatus[opsSnapshot.health]
                  : "bg-slate-200 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              }`}
            >
              {opsSnapshot ? `Health ${opsSnapshot.health.toUpperCase()}` : "Health unknown"}
            </span>
            <button
              type="button"
              onClick={onRefreshOps}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={opsLoading}
            >
              {opsLoading ? "Refreshing..." : "Refresh ops"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={onRunBackgroundOnce}
              disabled={opsActionPending !== null}
              className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-800 hover:bg-cyan-500/20 dark:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionPending === "run-background-once" ? "Running background..." : "Run background now"}
            </button>
            <button
              type="button"
              onClick={onRunBackgroundDry}
              disabled={opsActionPending !== null}
              className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-800 hover:bg-indigo-500/20 dark:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionPending === "run-background-dry" ? "Dry-run in progress..." : "Dry-run background"}
            </button>
            <button
              type="button"
              onClick={onResetCircuits}
              disabled={opsActionPending !== null}
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 hover:bg-amber-500/20 dark:text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionPending === "reset-circuits" ? "Resetting..." : "Reset provider circuits"}
            </button>
            <button
              type="button"
              onClick={onTriggerAlertSweep}
              disabled={opsActionPending !== null}
              className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-800 hover:bg-rose-500/20 dark:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionPending === "trigger-alert-sweep" ? "Sweeping alerts..." : "Trigger alert sweep"}
            </button>
          </div>
          {opsError ? <p className="text-red-200">Ops read error: {opsError}</p> : null}
          {opsSnapshot ? (
            <>
              <p className="text-slate-700 dark:text-slate-300">
                Snapshot {formatClock(opsSnapshot.generatedAt)} • runtime updated {formatClock(opsSnapshot.runtime.updatedAt)}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Runtime reservations {opsSnapshot.runtime.reservationCount} • stale {opsSnapshot.runtime.staleMinutes} minutes
              </p>
              {opsSnapshot.backgroundState.activeRun ? (
                <p className="text-amber-200">
                  Active background run: {formatClock(opsSnapshot.backgroundState.activeRun.startedAt)} • timeout{" "}
                  {Math.round(opsSnapshot.backgroundState.activeRun.timeoutMs / 1000)}s
                </p>
              ) : null}
              {opsSnapshot.backgroundState.lastRun ? (
                <p className="text-slate-700 dark:text-slate-300">
                  Last managed background status: {opsSnapshot.backgroundState.lastRun.status} • duration{" "}
                  {Math.round(opsSnapshot.backgroundState.lastRun.durationMs / 1000)}s
                  {opsSnapshot.backgroundState.lastRun.error ? ` • ${opsSnapshot.backgroundState.lastRun.error}` : ""}
                </p>
              ) : null}
              <p className="text-slate-700 dark:text-slate-300">
                Worker health: {opsSnapshot.worker.health} • consecutive failures {opsSnapshot.worker.consecutiveFailures}
                {opsSnapshot.worker.minutesSinceLastSuccess !== null
                  ? ` • last success ${opsSnapshot.worker.minutesSinceLastSuccess}m ago`
                  : " • no successful heartbeat yet"}
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Expected next run by: {formatClock(opsSnapshot.worker.expectedNextRunBy)} • cadence{" "}
                {opsSnapshot.worker.scheduleIntervalMinutes}m ± {opsSnapshot.worker.scheduleJitterMinutes}m
                {opsSnapshot.worker.missedSchedule ? " • schedule missed" : ""}
              </p>
              <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {opsSnapshot.worker.reasons.map((reason) => (
                  <li key={`worker-${reason}`} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700">
                    {reason}
                  </li>
                ))}
              </ul>
              {opsSnapshot.latestBackgroundRun ? (
                <p className="text-slate-700 dark:text-slate-300">
                  Latest background run: {formatClock(opsSnapshot.latestBackgroundRun.checkedAt)} • new{" "}
                  {opsSnapshot.latestBackgroundRun.newUpdates} / dup {opsSnapshot.latestBackgroundRun.duplicateUpdates}
                  {opsSnapshot.latestBackgroundRun.providerError ? ` • error ${opsSnapshot.latestBackgroundRun.providerError}` : ""}
                </p>
              ) : (
                <p className="text-amber-200">
                  No background run recorded yet. Trigger /api/travel-updates/background to verify worker path.
                </p>
              )}
              <p className="text-slate-700 dark:text-slate-300">
                Provider degradations: {opsSnapshot.provider.recentErrorCount} errors / {opsSnapshot.provider.circuitOpenCount}{" "}
                circuit-open runs
              </p>
              <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                {opsSnapshot.reasons.map((reason) => (
                  <li key={reason} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700">
                    {reason}
                  </li>
                ))}
              </ul>
              <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-100">
                <p className="font-semibold">Green status governance</p>
                {statusGovernanceBlockers.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {statusGovernanceBlockers.map((blocker) => (
                      <li key={`ops-${blocker.code}-${blocker.reason}`}>
                        {blocker.reason} &rarr; {blocker.remediation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-emerald-200">No local blockers. Green can be granted.</p>
                )}
              </div>
              <div className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5 text-[11px] text-indigo-100">
                <p className="font-semibold">Recent ops actions</p>
                {opsSnapshot.opsActions.recentActions.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {opsSnapshot.opsActions.recentActions.slice(0, 5).map((entry) => (
                      <li key={entry.id}>
                        {entry.action} • {entry.result} • {entry.actor}
                        {entry.replayed ? " • replayed" : ""} • {formatClock(entry.completedAt)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-indigo-100/80">No ops actions recorded yet.</p>
                )}
              </div>
              <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1.5 text-[11px] text-fuchsia-900 dark:text-fuchsia-100">
                <p className="font-semibold">Recent alert sweeps</p>
                {opsSnapshot.alertAudit.recentSweeps.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {opsSnapshot.alertAudit.recentSweeps.slice(0, 5).map((sweep) => (
                      <li key={sweep.id}>
                        {formatClock(sweep.evaluatedAt)} • {sweep.trigger} • alerts {sweep.totalAlerts} • sent{" "}
                        {sweep.sentAlerts} • suppressed {sweep.suppressedAlerts}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-fuchsia-100/80">No alert sweeps recorded yet.</p>
                )}
              </div>
              <ul className="max-h-24 space-y-1 overflow-auto text-[11px] text-slate-700 dark:text-slate-300">
                {opsSnapshot.audit.recentAuditTrail.slice(0, 5).map((entry) => (
                  <li key={entry.requestId} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700">
                    <p className="font-medium">
                      {formatClock(entry.checkedAt)} • {entry.mode}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      new {entry.newUpdates} / dup {entry.duplicateUpdates} / suppressed {entry.conflictSuppressed}
                    </p>
                    {entry.providerError ? <p className="text-red-200">Error: {entry.providerError}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-slate-600 dark:text-slate-400">Loading ops status...</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
