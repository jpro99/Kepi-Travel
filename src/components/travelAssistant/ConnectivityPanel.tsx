"use client";

import { useEffect, useState } from "react";
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const notificationsSupported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    const refreshNotificationStatus = async (): Promise<void> => {
      if (!notificationsSupported) {
        setNotificationsEnabled(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        setNotificationsEnabled(Boolean(subscription) && Notification.permission === "granted");
      } catch {
        setNotificationsEnabled(false);
      }
    };

    void refreshNotificationStatus();
  }, [notificationsSupported]);

  const handleNotificationToggle = async (): Promise<void> => {
    if (!notificationsSupported || notificationsBusy) {
      return;
    }
    setNotificationsBusy(true);
    setNotificationsError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();

      if (notificationsEnabled) {
        if (existingSubscription) {
          await existingSubscription.unsubscribe();
        }
        const response = await fetch("/api/push/unsubscribe", { method: "POST" });
        if (!response.ok) {
          throw new Error(`Push unsubscribe failed (${response.status})`);
        }
        setNotificationsEnabled(false);
        return;
      }

      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Browser notification permission not granted.");
      }

      const keyResponse = await fetch("/api/push/subscribe", { method: "GET" });
      if (!keyResponse.ok) {
        throw new Error(`Unable to fetch VAPID public key (${keyResponse.status}).`);
      }
      const keyPayload = (await keyResponse.json()) as { publicKey?: string };
      if (!keyPayload.publicKey) {
        throw new Error("Push public key missing from server response.");
      }

      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey) as unknown as BufferSource,
        }));

      const subscribeResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!subscribeResponse.ok) {
        throw new Error(`Push subscribe failed (${subscribeResponse.status}).`);
      }
      setNotificationsEnabled(true);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Unknown notification error.");
      setNotificationsEnabled(false);
    } finally {
      setNotificationsBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">Sync & connectivity policy</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Set Wi-Fi-only itinerary updates while optionally keeping location updates on cellular.
      </p>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-slate-700 dark:text-slate-300">Current network</span>
          <select
            value={networkMode}
            onChange={(event) => onNetworkModeChange(event.target.value as NetworkMode)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="wifi">Wi-Fi</option>
            <option value="cellular">Cellular</option>
            <option value="offline">Offline</option>
          </select>
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span>Update itinerary only on Wi-Fi</span>
          <input
            type="checkbox"
            checked={wifiOnlySync}
            onChange={(event) => onWifiOnlySyncToggle(event.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span>Allow location updates on cellular</span>
          <input
            type="checkbox"
            checked={allowCellularLocationUpdates}
            onChange={(event) => onAllowCellularLocationUpdatesChange(event.target.checked)}
          />
        </label>
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <span>Enable notifications</span>
            <button
              type="button"
              onClick={() => {
                void handleNotificationToggle();
              }}
              disabled={!notificationsSupported || notificationsBusy}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                notificationsEnabled
                  ? "bg-emerald-500/90 text-slate-950 hover:bg-emerald-400"
                  : "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {notificationsBusy ? "Updating..." : notificationsEnabled ? "Disable" : "Enable"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Notification status:{" "}
            {notificationsSupported ? (notificationsEnabled ? "enabled" : "disabled") : "disabled (unsupported)"}
          </p>
          {notificationsError ? <p className="mt-1 text-xs text-red-200">{notificationsError}</p> : null}
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-100/80 p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-xs text-slate-700 dark:text-slate-300">{locationStatusMessage}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Last sync: {formatClock(lastSyncAt)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Pending updates: {pendingSyncCount}</p>
          <p data-testid="queued-actions-outbox-count" className="text-xs text-slate-600 dark:text-slate-400">
            Queued actions outbox: {pendingOutboxCount}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Last outbox replay: {formatClock(lastOutboxReplayAt)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Provider mode: {updateMode}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Last provider check: {formatClock(lastProviderCheckAt)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Provider attempts (last check): {lastProviderAttempts}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Circuit status: {providerCircuitOpen ? "Open (cooldown active)" : "Closed"}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Queued provider updates: {queuedProviderUpdatesLength}</p>
          {lastProviderError ? <p className="text-xs text-red-200">Provider error: {lastProviderError}</p> : null}
          {lastAuditSummary ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Audit: {lastAuditSummary.newUpdates} new / {lastAuditSummary.duplicateUpdates} duplicate • known events{" "}
              {lastAuditSummary.totalKnownEvents}
            </p>
          ) : null}
          {lastConflictSummary ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Conflict resolution: {lastConflictSummary.acceptedUpdates} accepted / {lastConflictSummary.suppressedUpdates}{" "}
              suppressed
            </p>
          ) : null}
          {providerReports.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
              {providerReports.map((report) => (
                <li key={report.provider} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700">
                  <span className="font-medium">{report.provider}</span>: {report.updateCount} updates • {report.attempts}{" "}
                  attempts {report.circuitOpen ? "• circuit open" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
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
          className="w-full rounded-lg bg-indigo-500/90 px-3 py-2 font-semibold text-slate-100 hover:bg-indigo-400"
        >
          Sync now once
        </button>
        <div className="rounded-lg border border-slate-200 bg-slate-100/80 p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">Recent live updates</p>
          <ul className="mt-2 max-h-24 space-y-1 overflow-auto text-xs text-slate-700 dark:text-slate-300">
            {updateFeed.length > 0 ? (
              updateFeed.slice(0, 4).map((feed) => (
                <li key={feed.id} className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700">
                  <p className="font-medium">{feed.summary}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{formatClock(feed.appliedAt)}</p>
                </li>
              ))
            ) : (
              <li className="text-slate-600 dark:text-slate-400">No provider updates applied yet.</li>
            )}
          </ul>
        </div>
        {opsPanel}
      </div>
    </article>
  );
}
