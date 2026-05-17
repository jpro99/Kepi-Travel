"use client";

import type {
  TravelConflictResolutionSummary,
  TravelProviderReport,
  TravelUpdateAuditSummary,
  TravelUpdateMode,
} from "@/lib/travelAssistant/travelUpdateTypes";
import type { ReactNode } from "react";

type NetworkMode = "wifi" | "cellular" | "offline";

interface UpdateFeedItem {
  id: string;
  summary: string;
  appliedAt: string;
}

interface ConnectivityPanelProps {
  networkMode: NetworkMode;
  onNetworkModeChange: (nextMode: NetworkMode) => void;
  wifiOnlySync: boolean;
  onWifiOnlySyncToggle: (enabled: boolean) => void;
  allowCellularLocationUpdates: boolean;
  onAllowCellularLocationUpdatesChange: (enabled: boolean) => void;
  locationStatusMessage: string;
  lastSyncAt: string | null;
  pendingSyncCount: number;
  pendingOutboxCount: number;
  lastOutboxReplayAt: string | null;
  updateMode: TravelUpdateMode;
  lastProviderCheckAt: string | null;
  lastProviderAttempts: number;
  providerCircuitOpen: boolean;
  queuedProviderUpdatesLength: number;
  lastProviderError: string | null;
  lastAuditSummary: TravelUpdateAuditSummary | null;
  lastConflictSummary: TravelConflictResolutionSummary | null;
  providerReports: TravelProviderReport[];
  autoTransportUpdates: boolean;
  onAutoTransportUpdatesChange: (enabled: boolean) => void;
  onRunProviderCheck: () => void;
  isProviderCheckRunning: boolean;
  onFlushPendingSync: () => void;
  updateFeed: UpdateFeedItem[];
  formatClock: (value: string | null) => string;
  opsPanel: ReactNode;
}

export function ConnectivityPanel({
  networkMode,
  onNetworkModeChange,
  wifiOnlySync,
  onWifiOnlySyncToggle,
  allowCellularLocationUpdates,
  onAllowCellularLocationUpdatesChange,
  locationStatusMessage,
  lastSyncAt,
  pendingSyncCount,
  pendingOutboxCount,
  lastOutboxReplayAt,
  updateMode,
  lastProviderCheckAt,
  lastProviderAttempts,
  providerCircuitOpen,
  queuedProviderUpdatesLength,
  lastProviderError,
  lastAuditSummary,
  lastConflictSummary,
  providerReports,
  autoTransportUpdates,
  onAutoTransportUpdatesChange,
  onRunProviderCheck,
  isProviderCheckRunning,
  onFlushPendingSync,
  updateFeed,
  formatClock,
  opsPanel,
}: ConnectivityPanelProps) {
  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <h2 className="text-lg font-semibold">Sync & connectivity policy</h2>
      <p className="text-xs text-slate-400">
        Set Wi-Fi-only itinerary updates while optionally keeping location updates on cellular.
      </p>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-slate-300">Current network</span>
          <select
            value={networkMode}
            onChange={(event) => onNetworkModeChange(event.target.value as NetworkMode)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          >
            <option value="wifi">Wi-Fi</option>
            <option value="cellular">Cellular</option>
            <option value="offline">Offline</option>
          </select>
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <span>Update itinerary only on Wi-Fi</span>
          <input
            type="checkbox"
            checked={wifiOnlySync}
            onChange={(event) => onWifiOnlySyncToggle(event.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <span>Allow location updates on cellular</span>
          <input
            type="checkbox"
            checked={allowCellularLocationUpdates}
            onChange={(event) => onAllowCellularLocationUpdatesChange(event.target.checked)}
          />
        </label>
        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
          <p className="text-xs text-slate-300">{locationStatusMessage}</p>
          <p className="mt-1 text-xs text-slate-400">Last sync: {formatClock(lastSyncAt)}</p>
          <p className="text-xs text-slate-400">Pending updates: {pendingSyncCount}</p>
          <p data-testid="queued-actions-outbox-count" className="text-xs text-slate-400">
            Queued actions outbox: {pendingOutboxCount}
          </p>
          <p className="text-xs text-slate-400">Last outbox replay: {formatClock(lastOutboxReplayAt)}</p>
          <p className="text-xs text-slate-400">Provider mode: {updateMode}</p>
          <p className="text-xs text-slate-400">Last provider check: {formatClock(lastProviderCheckAt)}</p>
          <p className="text-xs text-slate-400">Provider attempts (last check): {lastProviderAttempts}</p>
          <p className="text-xs text-slate-400">Circuit status: {providerCircuitOpen ? "Open (cooldown active)" : "Closed"}</p>
          <p className="text-xs text-slate-400">Queued provider updates: {queuedProviderUpdatesLength}</p>
          {lastProviderError ? <p className="text-xs text-red-200">Provider error: {lastProviderError}</p> : null}
          {lastAuditSummary ? (
            <p className="text-xs text-slate-400">
              Audit: {lastAuditSummary.newUpdates} new / {lastAuditSummary.duplicateUpdates} duplicate • known events{" "}
              {lastAuditSummary.totalKnownEvents}
            </p>
          ) : null}
          {lastConflictSummary ? (
            <p className="text-xs text-slate-400">
              Conflict resolution: {lastConflictSummary.acceptedUpdates} accepted / {lastConflictSummary.suppressedUpdates}{" "}
              suppressed
            </p>
          ) : null}
          {providerReports.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
              {providerReports.map((report) => (
                <li key={report.provider} className="rounded border border-slate-700 px-2 py-1">
                  <span className="font-medium">{report.provider}</span>: {report.updateCount} updates • {report.attempts}{" "}
                  attempts {report.circuitOpen ? "• circuit open" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <span>Auto transport updates</span>
          <input
            type="checkbox"
            checked={autoTransportUpdates}
            onChange={(event) => onAutoTransportUpdatesChange(event.target.checked)}
          />
        </label>
        <button
          type="button"
          onClick={onRunProviderCheck}
          disabled={isProviderCheckRunning}
          className="w-full rounded-lg bg-cyan-500/90 px-3 py-2 font-semibold text-slate-900 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProviderCheckRunning ? "Checking providers..." : "Check live delays now"}
        </button>
        <button
          type="button"
          onClick={onFlushPendingSync}
          className="w-full rounded-lg bg-indigo-500/90 px-3 py-2 font-semibold hover:bg-indigo-400"
        >
          Sync now once
        </button>
        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
          <p className="text-xs font-semibold text-slate-200">Recent live updates</p>
          <ul className="mt-2 max-h-24 space-y-1 overflow-auto text-xs text-slate-300">
            {updateFeed.length > 0 ? (
              updateFeed.slice(0, 4).map((feed) => (
                <li key={feed.id} className="rounded border border-slate-700 px-2 py-1">
                  <p className="font-medium">{feed.summary}</p>
                  <p className="text-[11px] text-slate-400">{formatClock(feed.appliedAt)}</p>
                </li>
              ))
            ) : (
              <li className="text-slate-400">No provider updates applied yet.</li>
            )}
          </ul>
        </div>
        {opsPanel}
      </div>
    </article>
  );
}
