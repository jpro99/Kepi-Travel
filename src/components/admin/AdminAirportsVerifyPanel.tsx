"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AirportLayout, TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { AirportNavigatorMap } from "@/components/travelAssistant/AirportNavigatorMap";

/** Fully credentialed so the security question never blocks verify. */
const PREVIEW_CREDENTIALS: TravelerSecurityCredentials = {
  tsaPreCheck: false,
  clear: false,
  known: true,
};

interface BundledAirportSummary {
  iata: string;
  name: string;
  layoutVersion: string;
  updatedAt: string;
  routeGrade?: string;
  counts: {
    zones: number;
    nodes: number;
    edges: number;
    pois: number;
    gates: number;
    lounges: number;
  };
  errors: number;
  warnings: number;
}

/**
 * Admin Airports tab — click through every bundled airport as a traveler would
 * see it (same AirportNavigatorMap). Editing stays on /admin/airport-editor.
 */
export function AdminAirportsVerifyPanel() {
  const [airports, setAirports] = useState<BundledAirportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIata, setActiveIata] = useState<string | null>(null);
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [audit, setAudit] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [maptilerKey, setMaptilerKey] = useState("");
  const [previewGate, setPreviewGate] = useState("");
  const [previewLive, setPreviewLive] = useState(true);

  const openAirport = useCallback(async (iata: string) => {
    setBusy(true);
    setActiveIata(iata);
    setLayout(null);
    setAudit(null);
    try {
      const res = await fetch(`/api/admin/airport-layout/bundled?iata=${encodeURIComponent(iata)}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as {
        layout?: AirportLayout;
        audit?: { errors: string[]; warnings: string[] };
        error?: string;
      };
      if (!res.ok || !body.layout) throw new Error(body.error ?? `HTTP ${res.status}`);
      setLayout(body.layout);
      setAudit(body.audit ?? { errors: [], warnings: [] });
      setPreviewGate(body.layout.gateNodeResolver?.[0]?.prefix ?? "");
      setPreviewLive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layout");
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/airport-layout/bundled", { cache: "no-store" });
      const body = (await res.json()) as { airports?: BundledAirportSummary[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setAirports(body.airports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh airports");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/airport-layout/bundled", { cache: "no-store" });
        const body = (await res.json()) as { airports?: BundledAirportSummary[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        const list = body.airports ?? [];
        setAirports(list);
        if (list[0]) await openAirport(list[0].iata);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load airports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openAirport]);

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { maptilerKey?: string }) => {
        if (d.maptilerKey) setMaptilerKey(d.maptilerKey);
      })
      .catch(() => null);
  }, []);

  const activeIndex = useMemo(
    () => airports.findIndex((a) => a.iata === activeIata),
    [airports, activeIata],
  );

  const goPrev = () => {
    if (activeIndex <= 0) return;
    void openAirport(airports[activeIndex - 1]!.iata);
  };
  const goNext = () => {
    if (activeIndex < 0 || activeIndex >= airports.length - 1) return;
    void openAirport(airports[activeIndex + 1]!.iata);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Airports</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click an airport to see the same map travelers get. Use Prev/Next to walk every one.
            Edit pins in the airport editor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshList();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
          >
            Refresh
          </button>
          <a
            href="/admin/airport-editor"
            className="rounded-md bg-[#0b1f3a] px-3 py-1.5 text-xs font-bold text-[#f4c95d]"
          >
            Open editor
          </a>
        </div>
      </div>

      {loading ? <p className="text-xs text-slate-500">Loading airports…</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {airports.map((airport) => {
          const active = airport.iata === activeIata;
          return (
            <button
              key={airport.iata}
              type="button"
              onClick={() => {
                void openAirport(airport.iata);
              }}
              className={`min-w-[140px] flex-1 rounded-2xl border px-3 py-3 text-left transition sm:max-w-[200px] ${
                active
                  ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30"
                  : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-black">{airport.iata}</span>
                {airport.errors > 0 ? (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    {airport.errors} err
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    ✓
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">{airport.name}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {airport.counts.gates}g · {airport.counts.lounges}l · {airport.routeGrade ?? "schematic"}
              </p>
            </button>
          );
        })}
      </div>

      {activeIata ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold">
                {layout?.iata ?? activeIata}
                {layout ? ` · ${layout.name}` : ""}
              </p>
              <p className="text-[11px] text-slate-500">
                {layout
                  ? `${layout.layoutVersion} · ${layout.pois.length} POIs · routeGrade ${layout.routeGrade ?? "schematic"}`
                  : "Loading…"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={activeIndex <= 0 || busy}
                onClick={goPrev}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={activeIndex < 0 || activeIndex >= airports.length - 1 || busy}
                onClick={goNext}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-slate-700"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
              <button
                type="button"
                onClick={() => setPreviewLive(false)}
                className={`px-3 py-1.5 text-xs font-bold ${!previewLive ? "bg-[#0b1f3a] text-white" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
              >
                Plan (before you go)
              </button>
              <button
                type="button"
                onClick={() => setPreviewLive(true)}
                className={`px-3 py-1.5 text-xs font-bold ${previewLive ? "bg-[#0b1f3a] text-white" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
              >
                At airport
              </button>
            </div>
            {previewLive && (layout?.gateNodeResolver?.length ?? 0) > 0 ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Gate
                <select
                  value={previewGate}
                  onChange={(e) => setPreviewGate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                >
                  {layout!.gateNodeResolver!.map((entry) => {
                    const gatePoi = layout!.pois.find(
                      (poi) => poi.category === "gate" && poi.nodeId === entry.nodeId,
                    );
                    return (
                      <option key={`${entry.prefix}-${entry.nodeId}`} value={entry.prefix}>
                        {gatePoi?.name ?? `Gate ${entry.prefix}`}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
          </div>

          {busy || !layout ? (
            <p className="text-sm text-slate-500">Rendering {activeIata}…</p>
          ) : (
            <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <AirportNavigatorMap
                key={`${layout.iata}-${previewLive ? "live" : "plan"}-${previewGate}`}
                fill
                previewMode={!previewLive}
                maptilerKey={maptilerKey}
                iata={layout.iata}
                gateCode={previewLive ? previewGate || null : null}
                airlineName={null}
                proximityStatus="preview"
                minutesToDeparture={90}
                userLat={null}
                userLon={null}
                credentials={PREVIEW_CREDENTIALS}
                onCredentialsAnswer={() => undefined}
                layoutOverride={layout}
              />
            </div>
          )}

          {audit ? (
            <div className="space-y-2">
              {audit.errors.length === 0 && audit.warnings.length === 0 ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  ✓ Passes routing-quality audit
                </p>
              ) : null}
              {audit.errors.length > 0 ? (
                <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  <p className="font-bold">{audit.errors.length} error(s)</p>
                  <ul className="mt-1 list-disc pl-5">
                    {audit.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {audit.warnings.length > 0 ? (
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-bold">{audit.warnings.length} warning(s)</p>
                  <ul className="mt-1 list-disc pl-5">
                    {audit.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
