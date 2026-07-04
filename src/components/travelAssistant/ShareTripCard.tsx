"use client";

import { useState } from "react";

interface ShareTripCardProps {
  tripId: string | null;
  tripName: string;
}

type ShareState = "idle" | "loading" | "copied" | "shared" | "error";

interface SharePayload {
  token: string;
  url: string;
  expiresAt: string;
}

export function ShareTripCard({ tripId, tripName }: ShareTripCardProps) {
  const [state, setState] = useState<ShareState>("idle");
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createShare = async (): Promise<void> => {
    if (!tripId) {
      setState("error");
      setErrorMessage("Select a trip first.");
      return;
    }

    setState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/trips/share", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          options: {
            expiresInDays: 7,
            readOnly: true,
            showPersonalNotes: false,
          },
        }),
      });
      const payload = (await response.json()) as Partial<SharePayload> & { error?: string };
      if (!response.ok || !payload.token || !payload.url) {
        throw new Error(payload.error ?? `Share failed (${response.status})`);
      }

      const nextPayload: SharePayload = {
        token: payload.token,
        url: payload.url,
        expiresAt: payload.expiresAt ?? "",
      };
      setSharePayload(nextPayload);

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: `${tripName} — Kepi Travel`,
            text: `View our trip itinerary: ${tripName}`,
            url: nextPayload.url,
          });
          setState("shared");
          setTimeout(() => setState("idle"), 3000);
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") {
            setState("idle");
            return;
          }
        }
      }

      await navigator.clipboard.writeText(nextPayload.url);
      setState("copied");
      setTimeout(() => setState("idle"), 3000);
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not create share link.");
    }
  };

  const copyShareUrl = async (): Promise<void> => {
    if (!sharePayload?.url) return;
    try {
      await navigator.clipboard.writeText(sharePayload.url);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setErrorMessage("Could not copy link.");
    }
  };

  const revokeShare = async (): Promise<void> => {
    if (!sharePayload?.token) {
      setSharePayload(null);
      setState("idle");
      return;
    }
    try {
      await fetch("/api/trips/share", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: sharePayload.token }),
      });
    } catch {
      /* best-effort revoke */
    }
    setSharePayload(null);
    setState("idle");
    setErrorMessage(null);
  };

  const buttonLabel =
    state === "loading"
      ? "Creating link…"
      : state === "error"
        ? "Error — tap to retry"
        : state === "copied"
          ? "✓ Link copied!"
          : state === "shared"
            ? "✓ Shared!"
            : `Share "${tripName}"`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xl">🔗</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Share trip</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Create a read-only link to share your itinerary with travel companions or family.
          </p>
          {!tripId ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Open or create a trip first to share it.</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          ) : null}
          {sharePayload ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
                <p className="min-w-0 flex-1 truncate text-xs font-mono text-slate-700 dark:text-slate-300">{sharePayload.url}</p>
              </div>
              {sharePayload.expiresAt ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Expires {new Date(sharePayload.expiresAt).toLocaleString()}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyShareUrl()}
                  className="flex-1 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white transition hover:bg-sky-500"
                >
                  {state === "copied" ? "✓ Copied!" : "Copy link"}
                </button>
                {typeof navigator.share === "function" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.share({
                        title: `${tripName} — Kepi Travel`,
                        text: `View our trip itinerary: ${tripName}`,
                        url: sharePayload.url,
                      }).catch(() => {
                        setErrorMessage("Could not open share sheet.");
                      });
                    }}
                    className="rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                  >
                    Share
                  </button>
                ) : null}
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
              disabled={state === "loading" || !tripId}
              className="mt-3 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
