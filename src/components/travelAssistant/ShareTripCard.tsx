"use client";

import { useState } from "react";

interface ShareTripCardProps {
  tripName: string;
}

type ShareState = "idle" | "loading" | "copied" | "error";

export function ShareTripCard({ tripName }: ShareTripCardProps) {
  const [state, setState] = useState<ShareState>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const createShare = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) { setState("error"); return; }
      const data = await res.json() as { token: string };
      const url = `${window.location.origin}/share/${data.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
    }
  };

  const revokeShare = async () => {
    await fetch("/api/share", { method: "DELETE", credentials: "include" });
    setShareUrl(null);
    setState("idle");
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xl">🔗</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Share trip</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Create a read-only link to share your itinerary with travel companions or family.
          </p>
          {shareUrl ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <p className="min-w-0 flex-1 truncate text-xs font-mono text-slate-700 dark:text-slate-300">{shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(shareUrl); setState("copied"); setTimeout(() => setState("idle"), 2000); }}
                  className="flex-1 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white transition hover:bg-sky-500"
                >
                  {state === "copied" ? "✓ Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={() => void revokeShare()}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void createShare()}
              disabled={state === "loading"}
              className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {state === "loading" ? "Creating link…" : state === "error" ? "Error — tap to retry" : `Share "${tripName}"`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
