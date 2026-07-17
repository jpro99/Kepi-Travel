"use client";

import { useCallback, useEffect, useState } from "react";
import type { MapHelperReport } from "@/lib/airportNav/mapHelperStore";

/**
 * Admin inbox for one-tap map-helper confirms. Accept/dismiss only — never
 * auto-moves layout pins (use click-to-place after review).
 */
export function MapHelperReportsPanel({ iata }: { iata?: string }) {
  const [reports, setReports] = useState<MapHelperReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "dismissed" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (iata) params.set("iata", iata);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/map-helper/reports?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as { reports?: MapHelperReport[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setReports(payload.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [iata, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (reportId: string, action: "accept" | "dismiss") => {
      setBusyId(reportId);
      try {
        const res = await fetch("/api/admin/map-helper/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, action }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `HTTP ${res.status}`);
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Map helper reports</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            One-tap Door / Starbucks confirms from helpers you enabled. Review here — then use
            click-to-place if a pin should move. Nothing auto-publishes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["pending", "accepted", "dismissed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                statusFilter === s
                  ? "bg-sky-600 text-white"
                  : "border border-slate-300 dark:border-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold dark:border-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="text-xs text-slate-500">Loading…</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="overflow-auto">
        <table className="min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Airport</th>
              <th className="px-2 py-2">Tap</th>
              <th className="px-2 py-2">Coords</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-2 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-2 py-2 font-semibold">{r.iata}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold">
                    {r.kind === "confirm_door" ? r.doorLabel : r.poiName}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {r.kind}
                    {r.poiCategory ? ` · ${r.poiCategory}` : ""}
                    {r.accuracyM != null ? ` · GPS ±${Math.round(r.accuracyM)}m` : ""}
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-[10px]">
                  {r.pos[1].toFixed(5)}, {r.pos[0].toFixed(5)}
                </td>
                <td className="px-2 py-2">{r.status}</td>
                <td className="px-2 py-2">
                  {r.status === "pending" ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => {
                          void act(r.id, "accept");
                        }}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => {
                          void act(r.id, "dismiss");
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold dark:border-slate-700 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && reports.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No helper reports yet.</p>
        ) : null}
      </div>
    </section>
  );
}
