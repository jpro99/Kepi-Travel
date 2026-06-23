"use client";

import { useEffect, useState } from "react";
import type { SearchSnapshot } from "@/lib/flights/searchSnapshotCache";

function timeAgo(createdAt: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - createdAt) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface VerifyResult {
  verified: boolean;
  message?: string;
  bookUrl?: string;
  bookLabel?: string;
}

export function RecentSearchesList() {
  const [snapshots, setSnapshots] = useState<SearchSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/decision/recent-searches")
      .then((res) => (res.ok ? res.json() : { snapshots: [] }))
      .then((data: { snapshots: SearchSnapshot[] }) => {
        if (!cancelled) setSnapshots(data.snapshots ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || snapshots.length === 0) return null;

  const verifyRow = async (snapshotId: string, originIata: string, kind: "cash" | "award") => {
    const key = `${snapshotId}-${originIata}-${kind}`;
    setVerifying(key);
    try {
      const res = await fetch("/api/decision/verify-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, originIata, kind }),
      });
      const data = (await res.json()) as VerifyResult;
      setVerifyResults((prev) => ({ ...prev, [key]: data }));
    } catch {
      setVerifyResults((prev) => ({ ...prev, [key]: { verified: false, message: "Couldn't verify right now." } }));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-600/60 bg-[#152238]/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent searches</p>
      <ul className="mt-2 space-y-2">
        {snapshots.slice(0, 5).map((snap) => {
          const cheapestCash = snap.originCashLeaderboard[0];
          const cheapestAward = snap.originAwardLeaderboard[0];
          return (
            <li
              key={snap.id}
              className="rounded-xl border border-slate-700/60 bg-[#0b1f3a]/50 px-3 py-2 text-xs text-slate-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">
                  → {snap.destination} · {timeAgo(snap.createdAt)}
                </p>
                <p className="text-slate-400">
                  {cheapestCash ? `$${(cheapestCash.totalAmount / 100).toLocaleString()} cash` : null}
                  {cheapestCash && cheapestAward ? " · " : null}
                  {cheapestAward ? `${cheapestAward.milesCost.toLocaleString()} mi` : null}
                </p>
              </div>
              {cheapestCash ? (
                <div className="mt-1 flex items-center gap-2">
                  <span>{cheapestCash.origin}</span>
                  <button
                    type="button"
                    onClick={() => void verifyRow(snap.id, cheapestCash.origin, "cash")}
                    disabled={verifying === `${snap.id}-${cheapestCash.origin}-cash`}
                    className="rounded-lg border border-sky-500/40 bg-sky-950/60 px-2 py-0.5 text-[10px] font-bold text-sky-200 hover:bg-sky-900/60 disabled:opacity-50"
                  >
                    {verifying === `${snap.id}-${cheapestCash.origin}-cash` ? "Verifying…" : "Verify"}
                  </button>
                  {verifyResults[`${snap.id}-${cheapestCash.origin}-cash`] ? (
                    verifyResults[`${snap.id}-${cheapestCash.origin}-cash`]?.verified ? (
                      <a
                        href={verifyResults[`${snap.id}-${cheapestCash.origin}-cash`]?.bookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-300"
                      >
                        ✓ verified just now — {verifyResults[`${snap.id}-${cheapestCash.origin}-cash`]?.bookLabel}
                      </a>
                    ) : (
                      <span className="text-[10px] text-amber-300">
                        {verifyResults[`${snap.id}-${cheapestCash.origin}-cash`]?.message}
                      </span>
                    )
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
