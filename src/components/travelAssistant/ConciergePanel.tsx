"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingPlanId } from "@/lib/billing/plans";

interface ConciergePanelReservation {
  type: string;
  title: string;
  location?: string;
}

interface ConciergePanelProps {
  tripId: string | null;
  tripName: string;
  destination: string;
  billingPlan: BillingPlanId;
  showUpsellWhenUnavailable?: boolean;
  reservations: ConciergePanelReservation[];
  onRequestUpgrade?: () => void;
}

interface ConciergeMonitorState {
  tripId: string;
  active: boolean;
  autoRebook: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
}

const LOUNGE_DIRECTORY: Record<string, string[]> = {
  ATL: ["The Club ATL", "Delta Sky Club Concourse F"],
  BOS: ["The Lounge BOS", "Air France Lounge"],
  DEN: ["Centurion Lounge", "United Club East"],
  DFW: ["Capital One Lounge", "The Club DFW"],
  JFK: ["Primeclass Lounge", "Centurion Lounge Terminal 4"],
  LAX: ["Star Alliance Lounge", "Delta Sky Club Terminal 3"],
  MIA: ["Turkish Airlines Lounge", "Admirals Club D30"],
  ORD: ["Swissport Lounge", "United Club C10"],
  SEA: ["The Club SEA", "Delta Sky Club A"],
  SFO: ["United Polaris Lounge", "Centurion Lounge Terminal 3"],
};

function extractAirportCode(input: string): string | null {
  const match = input.toUpperCase().match(/\b([A-Z]{3})\b/u);
  return match?.[1] ?? null;
}

function findAirportCode(destination: string, reservations: ConciergePanelReservation[]): string | null {
  for (const reservation of reservations) {
    const code = extractAirportCode(`${reservation.location ?? ""} ${reservation.title}`);
    if (code) {
      return code;
    }
  }
  return extractAirportCode(destination);
}

export function ConciergePanel({
  tripId,
  tripName,
  destination,
  billingPlan,
  showUpsellWhenUnavailable = true,
  reservations,
  onRequestUpgrade,
}: ConciergePanelProps) {
  const [monitorState, setMonitorState] = useState<ConciergeMonitorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRebookDraft, setAutoRebookDraft] = useState(false);
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [supportSubject, setSupportSubject] = useState(`Priority help needed for ${tripName}`);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSuccess, setSupportSuccess] = useState<string | null>(null);

  const isConcierge = billingPlan === "concierge";

  const loadState = useCallback(async (): Promise<void> => {
    if (!tripId || !isConcierge) {
      setMonitorState(null);
      return;
    }
    try {
      const response = await fetch(`/api/concierge/monitor?tripId=${encodeURIComponent(tripId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { error?: string; state?: ConciergeMonitorState | null };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load concierge status (${response.status})`);
      }
      setMonitorState(payload.state ?? null);
      setAutoRebookDraft(payload.state?.autoRebook ?? false);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to load concierge monitoring state.");
    }
  }, [tripId, isConcierge]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadState();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadState]);

  const toggleMonitoring = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!tripId || busy) return;
      setBusy(true);
      setError(null);
      try {
        if (enabled) {
          const response = await fetch("/api/concierge/monitor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId, autoRebook: autoRebookDraft }),
          });
          const payload = (await response.json()) as { error?: string; state?: ConciergeMonitorState };
          if (!response.ok || !payload.state) {
            throw new Error(payload.error ?? `Unable to start monitoring (${response.status})`);
          }
          setMonitorState(payload.state);
        } else {
          const response = await fetch("/api/concierge/monitor", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId }),
          });
          const payload = (await response.json()) as { error?: string; state?: ConciergeMonitorState };
          if (!response.ok || !payload.state) {
            throw new Error(payload.error ?? `Unable to stop monitoring (${response.status})`);
          }
          setMonitorState(payload.state);
        }
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "Could not update proactive monitoring.");
      } finally {
        setBusy(false);
      }
    },
    [tripId, busy, autoRebookDraft],
  );

  const toggleAutoRebook = useCallback(
    async (enabled: boolean): Promise<void> => {
      setAutoRebookDraft(enabled);
      if (!tripId || !monitorState?.active || busy) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/concierge/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, autoRebook: enabled }),
        });
        const payload = (await response.json()) as { error?: string; state?: ConciergeMonitorState };
        if (!response.ok || !payload.state) {
          throw new Error(payload.error ?? `Unable to update auto-rebook setting (${response.status})`);
        }
        setMonitorState(payload.state);
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "Could not update auto-rebook.");
      } finally {
        setBusy(false);
      }
    },
    [tripId, monitorState?.active, busy],
  );

  const airportCode = useMemo(() => findAirportCode(destination, reservations), [destination, reservations]);
  const lounges = useMemo(() => {
    if (!airportCode) {
      return [];
    }
    return LOUNGE_DIRECTORY[airportCode] ?? [];
  }, [airportCode]);

  if (!tripId) {
    return null;
  }

  if (!isConcierge) {
    if (!showUpsellWhenUnavailable) {
      return null;
    }
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <h3 className="text-sm font-semibold text-amber-100">Concierge VIP automation</h3>
        <p className="mt-1 text-xs text-amber-100/80">
          Upgrade to Concierge for proactive 5-minute monitoring, auto-rebook workflows, and priority support.
        </p>
        <button
          type="button"
          onClick={onRequestUpgrade}
          className="mt-3 rounded-md bg-amber-300/20 px-2.5 py-1.5 text-xs font-semibold text-amber-50 ring-1 ring-amber-300/40 transition hover:bg-amber-300/30"
        >
          Upgrade to Concierge
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Concierge tier</p>
          <h3 className="text-base font-semibold text-indigo-50">VIP trip operations for {tripName}</h3>
          <p className="text-xs text-indigo-100/80">Detects critical delays before app open and preps rebooking guidance.</p>
        </div>
        <p className="rounded-md border border-indigo-300/40 bg-indigo-950/40 px-2 py-1 text-xs text-indigo-100">
          {monitorState?.active ? "Monitoring active" : "Monitoring inactive"}
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
          <span>Proactive monitoring</span>
          <input
            type="checkbox"
            checked={Boolean(monitorState?.active)}
            disabled={busy}
            onChange={(event) => {
              void toggleMonitoring(event.target.checked);
            }}
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
          <span>Auto-rebook</span>
          <input
            type="checkbox"
            checked={autoRebookDraft}
            disabled={busy}
            onChange={(event) => {
              void toggleAutoRebook(event.target.checked);
            }}
          />
        </label>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <p className="text-xs uppercase tracking-wide text-slate-400">Lounge access intelligence</p>
        {airportCode ? (
          lounges.length > 0 ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-100">{airportCode} nearby lounges</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-300">
                {lounges.map((lounge) => (
                  <li key={lounge}>{lounge}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-300">No free LoungeBuddy listing found for {airportCode} yet.</p>
          )
        ) : (
          <p className="mt-1 text-xs text-slate-300">Add a flight reservation with airport code to unlock lounge suggestions.</p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">Data source: free LoungeBuddy directory snapshots.</p>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
        <button
          type="button"
          onClick={() => {
            setShowSupportForm((previous) => !previous);
            setSupportSuccess(null);
          }}
          className="rounded-md border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-800"
        >
          Talk to a human
        </button>
        {showSupportForm ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSupportSuccess("Priority ticket queued. Concierge support will respond shortly.");
              setSupportMessage("");
            }}
          >
            <label className="block text-xs text-slate-300">
              Subject
              <input
                value={supportSubject}
                onChange={(event) => setSupportSubject(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-300">
              Priority details
              <textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                rows={3}
                required
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"
            >
              Submit priority ticket
            </button>
            {supportSuccess ? <p className="text-xs text-emerald-300">{supportSuccess}</p> : null}
          </form>
        ) : null}
      </div>

      {monitorState?.lastCheckedAt ? (
        <p className="mt-2 text-[11px] text-slate-300">
          Last check: {new Date(monitorState.lastCheckedAt).toLocaleString()} • cadence {monitorState.intervalMinutes}m
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
