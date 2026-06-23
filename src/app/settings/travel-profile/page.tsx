"use client";

import { useEffect, useState } from "react";
import type { GeoAirport, PointsBalance, StatusEntry, TravelInstrument, TravelerGenome } from "@/lib/traveler/types";
import { generateId } from "@/lib/utils/generateId";

const INSTRUMENT_TYPES: TravelInstrument["type"][] = [
  "upgrade_certificate",
  "companion_certificate",
  "suite_certificate",
  "free_night_award",
  "guest_upgrade",
];

function toggleSwitch(active: boolean, onClick: () => void) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        active ? "bg-blue-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          active ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function fieldInput(value: string, onChange: (v: string) => void, placeholder: string, className = "") {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none ${className}`}
    />
  );
}

export default function TravelProfileSettingsPage() {
  const [genome, setGenome] = useState<TravelerGenome | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/traveler/genome")
      .then((res) => res.json())
      .then((data: { genome: TravelerGenome }) => {
        if (!cancelled) setGenome(data.genome);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: TravelerGenome) => {
    setGenome(next);
    setSaving(true);
    try {
      const res = await fetch("/api/traveler/genome", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", genome: next }),
      });
      const data = (await res.json()) as { genome: TravelerGenome };
      setGenome(data.genome);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !genome) {
    return <div className="p-8 text-slate-600">Loading your travel profile…</div>;
  }

  const updateAirports = (next: GeoAirport[]) => void save({ ...genome, geoCluster: next });
  const updateStatuses = (next: StatusEntry[]) => void save({ ...genome, statuses: next });
  const updateBalances = (next: PointsBalance[]) => void save({ ...genome, pointsBalances: next });
  const updateInstruments = (next: TravelInstrument[]) => void save({ ...genome, instruments: next });

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-800">Your Travel Profile</h1>
        <p className="mt-2 text-slate-600">
          Saved once, used everywhere. Your home airports and loyalty status auto-fill every search on{" "}
          <a href="/book" className="text-blue-600 underline">
            /book
          </a>{" "}
          — no more retyping &quot;Alaska Gold&quot; every time.
        </p>
        {saving ? <p className="mt-2 text-xs text-blue-600">Saving…</p> : null}
        {!saving && savedAt ? <p className="mt-2 text-xs text-emerald-600">Saved.</p> : null}

        {/* Home airports */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Home airports</h3>
          <p className="text-sm text-slate-500">Used to auto-fill your departure airport instead of asking every time.</p>
          <div className="mt-4 space-y-3">
            {genome.geoCluster.map((airport, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-3">
                {fieldInput(airport.iata, (v) => {
                  const next = [...genome.geoCluster];
                  next[i] = { ...airport, iata: v.toUpperCase().slice(0, 3) };
                  updateAirports(next);
                }, "IATA", "w-20 uppercase")}
                {fieldInput(airport.name, (v) => {
                  const next = [...genome.geoCluster];
                  next[i] = { ...airport, name: v };
                  updateAirports(next);
                }, "Airport name", "flex-1 min-w-[140px]")}
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  Primary
                  {toggleSwitch(Boolean(airport.isPrimary), () => {
                    const next = genome.geoCluster.map((a, j) => ({ ...a, isPrimary: j === i }));
                    updateAirports(next);
                  })}
                </label>
                <button
                  type="button"
                  onClick={() => updateAirports(genome.geoCluster.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              updateAirports([...genome.geoCluster, { iata: "", name: "", driveMinutes: 30, isPrimary: genome.geoCluster.length === 0 }])
            }
            className="mt-4 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Add airport
          </button>
        </div>

        {/* Loyalty & status */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Loyalty &amp; status</h3>
          <p className="text-sm text-slate-500">
            Saved here once — Kepi will auto-apply it (e.g. Alaska MVP Gold reposition plays) without you mentioning it in every prompt.
          </p>
          <div className="mt-4 space-y-3">
            {genome.statuses.map((status, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-3">
                {fieldInput(status.program, (v) => {
                  const next = [...genome.statuses];
                  next[i] = { ...status, program: v };
                  updateStatuses(next);
                }, "Program (e.g. Mileage Plan)", "min-w-[140px]")}
                {fieldInput(status.airline ?? "", (v) => {
                  const next = [...genome.statuses];
                  next[i] = { ...status, airline: v || undefined };
                  updateStatuses(next);
                }, "Airline", "w-32")}
                {fieldInput(status.tier, (v) => {
                  const next = [...genome.statuses];
                  next[i] = { ...status, tier: v };
                  updateStatuses(next);
                }, "Tier (e.g. MVP Gold)", "w-32")}
                {fieldInput(status.expiresAt ?? "", (v) => {
                  const next = [...genome.statuses];
                  next[i] = { ...status, expiresAt: v || undefined };
                  updateStatuses(next);
                }, "Expires YYYY-MM-DD", "w-36")}
                <button
                  type="button"
                  onClick={() => updateStatuses(genome.statuses.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              updateStatuses([
                ...genome.statuses,
                { program: "", tier: "", loungeAccess: false, prioritySecurity: false, freeCheckedBags: 0 },
              ])
            }
            className="mt-4 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Add status
          </button>
        </div>

        {/* Points balances */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Points &amp; miles balances</h3>
          <div className="mt-4 space-y-3">
            {genome.pointsBalances.map((balance, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-3">
                {fieldInput(balance.program, (v) => {
                  const next = [...genome.pointsBalances];
                  next[i] = { ...balance, program: v };
                  updateBalances(next);
                }, "Program", "min-w-[160px]")}
                <input
                  type="number"
                  value={balance.balance}
                  onChange={(e) => {
                    const next = [...genome.pointsBalances];
                    next[i] = { ...balance, balance: Number(e.target.value) || 0 };
                    updateBalances(next);
                  }}
                  className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                  placeholder="Balance"
                />
                <button
                  type="button"
                  onClick={() => updateBalances(genome.pointsBalances.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateBalances([...genome.pointsBalances, { program: "", balance: 0, baselineCpp: 1.3 }])}
            className="mt-4 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Add balance
          </button>
        </div>

        {/* Instruments / certs */}
        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <h3 className="text-lg font-medium text-slate-800">Upgrade certs &amp; instruments</h3>
          <div className="mt-4 space-y-3">
            {genome.instruments.map((inst, i) => (
              <div key={inst.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-3">
                <select
                  value={inst.type}
                  onChange={(e) => {
                    const next = [...genome.instruments];
                    next[i] = { ...inst, type: e.target.value as TravelInstrument["type"] };
                    updateInstruments(next);
                  }}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800"
                >
                  {INSTRUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                {fieldInput(inst.label, (v) => {
                  const next = [...genome.instruments];
                  next[i] = { ...inst, label: v };
                  updateInstruments(next);
                }, "Label", "min-w-[160px]")}
                <input
                  type="number"
                  value={inst.quantity}
                  onChange={(e) => {
                    const next = [...genome.instruments];
                    next[i] = { ...inst, quantity: Number(e.target.value) || 0 };
                    updateInstruments(next);
                  }}
                  className="w-20 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800"
                  placeholder="Qty"
                />
                <button
                  type="button"
                  onClick={() => updateInstruments(genome.instruments.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              updateInstruments([
                ...genome.instruments,
                { id: generateId(), type: "guest_upgrade", program: "", label: "", quantity: 1, estimatedValueUsd: 0 },
              ])
            }
            className="mt-4 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Add instrument
          </button>
        </div>

        <a href="/book" className="mt-8 inline-block text-sm font-semibold text-blue-600 underline">
          ← Back to Book a trip
        </a>
      </div>
    </div>
  );
}
