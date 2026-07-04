"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface ShareModalProps {
  open: boolean;
  tripId: string | null;
  tripName: string | null;
  onClose: () => void;
}

interface SharePayload {
  token: string;
  url: string;
  expiresAt: string;
  options: {
    expiresInDays: number;
    readOnly: boolean;
    showPersonalNotes: boolean;
  };
  existing: boolean;
}

export function ShareModal({ open, tripId, tripName, onClose }: ShareModalProps) {
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [readOnly, setReadOnly] = useState(true);
  const [showPersonalNotes, setShowPersonalNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const createOrRefreshShare = useCallback(async (): Promise<void> => {
    if (!tripId || busy) return;
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/trips/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          options: {
            expiresInDays,
            readOnly,
            showPersonalNotes,
          },
        }),
      });
      const payload = (await response.json()) as Partial<SharePayload> & { error?: string };
      if (!response.ok || !payload.token || !payload.url || !payload.expiresAt || !payload.options) {
        throw new Error(payload.error ?? `Share API returned ${response.status}`);
      }
      setSharePayload({
        token: payload.token,
        url: payload.url,
        expiresAt: payload.expiresAt,
        options: payload.options,
        existing: Boolean(payload.existing),
      });
      setSuccessMessage(
        payload.existing
          ? "Existing share link loaded."
          : "Share link created.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setBusy(false);
    }
  }, [busy, expiresInDays, readOnly, showPersonalNotes, tripId]);

  const revokeLink = async (): Promise<void> => {
    if (!sharePayload?.token || busy) return;
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/trips/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sharePayload.token,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Share revoke failed (${response.status})`);
      }
      setSharePayload(null);
      setSuccessMessage("Share link revoked.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not revoke link.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !tripId) return;
    const timeout = window.setTimeout(() => {
      void createOrRefreshShare();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [createOrRefreshShare, open, tripId]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full flex-col border border-slate-700 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:h-auto sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Share Trip</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tripName ? `Sharing ${tripName}. ` : ""}
              Family and friends on this link can view trip photos and leave comments.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </header>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Link expiry
            </span>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <span>Read-only share link</span>
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <span>Include personal notes</span>
            <input
              type="checkbox"
              checked={showPersonalNotes}
              onChange={(event) => setShowPersonalNotes(event.target.checked)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!tripId || busy}
              onClick={() => {
                void createOrRefreshShare();
              }}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Generating..." : "Generate link"}
            </button>
            {sharePayload ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void revokeLink();
                }}
                className="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revoke link
              </button>
            ) : null}
          </div>
          {errorMessage ? <p className="text-xs text-red-500">{errorMessage}</p> : null}
          {successMessage ? <p className="text-xs text-emerald-600 dark:text-emerald-300">{successMessage}</p> : null}
        </div>

        {sharePayload ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Expires {new Date(sharePayload.expiresAt).toLocaleString()}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={sharePayload.url}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sharePayload.url);
                    setSuccessMessage("Share URL copied.");
                  } catch {
                    setErrorMessage("Clipboard unavailable.");
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Copy
              </button>
            </div>
            <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <QRCodeSVG value={sharePayload.url} size={172} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
