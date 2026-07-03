"use client";

import { useMemo, useState } from "react";
import {
  buildFlightLegsFromIntent,
  defaultEnabledLegIds,
} from "@/lib/decision/flightLegPlanner";
import { buildGoogleFlightsUrl, resolveAirlineHomeUrl } from "@/lib/decision/bookingLinks";
import type { TripIntent } from "@/lib/decision/types";

export interface StoredTripPlan {
  rawPrompt: string;
  intent: TripIntent;
  checkedBags?: boolean;
  statusNote?: string;
  enabledLegIds: string[];
}

interface BookFlightsWizardProps {
  open: boolean;
  tripPlan: StoredTripPlan | null;
  onClose: () => void;
  onSavePrefs: (prefs: Pick<StoredTripPlan, "checkedBags" | "statusNote" | "enabledLegIds">) => void;
}

export function readStoredTripPlan(tripId: string | null): StoredTripPlan | null {
  if (!tripId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`kepi:trip-plan:${tripId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTripPlan;
  } catch {
    return null;
  }
}

export function writeStoredTripPlan(tripId: string, plan: StoredTripPlan): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`kepi:trip-plan:${tripId}`, JSON.stringify(plan));
}

export function BookFlightsWizard({ open, tripPlan, onClose, onSavePrefs }: BookFlightsWizardProps) {
  const baseLegs = useMemo(
    () => (tripPlan ? buildFlightLegsFromIntent(tripPlan.intent) : []),
    [tripPlan],
  );
  const [enabledLegIds, setEnabledLegIds] = useState<string[]>(
    tripPlan?.enabledLegIds ?? defaultEnabledLegIds(baseLegs),
  );
  const [checkedBags, setCheckedBags] = useState(tripPlan?.checkedBags ?? false);
  const [statusNote, setStatusNote] = useState(tripPlan?.statusNote ?? "");

  const legs = useMemo(() => {
    return baseLegs.map((leg) => ({
      ...leg,
      enabled: leg.optional ? enabledLegIds.includes(leg.id) : true,
    }));
  }, [baseLegs, enabledLegIds]);

  const selectedLegs = legs.filter((leg) => leg.enabled);

  const toggleLeg = (legId: string): void => {
    const leg = baseLegs.find((entry) => entry.id === legId);
    if (!leg?.optional) return;
    setEnabledLegIds((prev) =>
      prev.includes(legId) ? prev.filter((id) => id !== legId) : [...prev, legId],
    );
  };

  if (!open || !tripPlan) return null;

  const preferredAirline = tripPlan.intent.preferredAirlines?.[0];
  const airlineUrl = preferredAirline ? resolveAirlineHomeUrl(preferredAirline) : null;

  const handleSearch = (): void => {
    onSavePrefs({ checkedBags, statusNote, enabledLegIds });
    const outbound = selectedLegs.find((leg) => leg.role === "outbound");
    const returnLeg = selectedLegs.find((leg) => leg.role === "return");
    if (outbound) {
      const url = buildGoogleFlightsUrl({
        origin: outbound.fromIata,
        destination: outbound.toIata,
        departureDate: outbound.departureDate,
        returnDate: returnLeg?.departureDate,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Book flights</p>
        <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Which legs do you want to search now?</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Start with outbound and return — add connectors later if you need them.
        </p>

        <ul className="mt-4 space-y-2">
          {legs.map((leg) => (
            <li key={leg.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={leg.enabled}
                  disabled={!leg.optional}
                  onChange={() => toggleLeg(leg.id)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {leg.role === "outbound" ? "Outbound" : leg.role === "return" ? "Return" : "Connector"} ·{" "}
                    {leg.fromLabel} → {leg.toLabel}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {leg.fromIata} → {leg.toIata} · {leg.departureDate}
                  </span>
                  {leg.loyaltyNote ? (
                    <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-300">{leg.loyaltyNote}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
            <input type="checkbox" checked={checkedBags} onChange={(e) => setCheckedBags(e.target.checked)} />
            I need a checked bag
          </label>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Airline status (optional)
            <input
              type="text"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="e.g. Alaska MVP Gold"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSearch}
            disabled={selectedLegs.length === 0}
            className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Search selected →
          </button>
          {airlineUrl ? (
            <a
              href={airlineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              {preferredAirline} site ↗
            </a>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-500">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
