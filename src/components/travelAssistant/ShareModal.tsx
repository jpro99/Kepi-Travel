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
  intendedEmail?: string | null;
}

export function ShareModal({ open, tripId, tripName, onClose }: ShareModalProps) {
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [readOnly, setReadOnly] = useState(true);
  const [showPersonalNotes, setShowPersonalNotes] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const shareOptions = {
    expiresInDays,
    readOnly,
    showPersonalNotes,
  };

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
          options: shareOptions,
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
        intendedEmail: null,
      });
      setSuccessMessage(
        payload.existing
          ? "Open link loaded (anyone with the URL can view)."
          : "Open link created (anyone with the URL can view).",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setBusy(false);
    }
  }, [busy, readOnly, showPersonalNotes, expiresInDays, tripId]);

  const sendEmailInvite = async (): Promise<void> => {
    if (!tripId || busy) return;
    const email = recipientEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage("Enter a valid email address for your family member or friend.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/trips/share/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          email,
          options: shareOptions,
        }),
      });
      const payload = (await response.json()) as Partial<SharePayload> & {
        error?: string;
        ok?: boolean;
        emailSent?: boolean;
        intendedEmail?: string;
      };
      if (!response.ok || !payload.token || !payload.url || !payload.expiresAt) {
        throw new Error(payload.error ?? `Invite failed (${response.status})`);
      }
      setSharePayload({
        token: payload.token,
        url: payload.url,
        expiresAt: payload.expiresAt,
        options: shareOptions,
        existing: Boolean(payload.existing),
        intendedEmail: payload.intendedEmail ?? email.toLowerCase(),
      });
      setSuccessMessage(
        payload.emailSent
          ? `Invite sent to ${email}. They must sign in with that email to open the trip and photos.`
          : "Invite link created.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not send invite.");
    } finally {
      setBusy(false);
    }
  };

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
    if (!open) {
      setSharePayload(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setRecipientEmail("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92dvh] w-full flex-col overflow-y-auto border border-slate-700 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:h-auto sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Share Trip</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tripName ? `Sharing ${tripName}. ` : ""}
              Email invites are locked to that person&apos;s sign-in. They can view the itinerary and scroll to trip photos at the bottom.
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
              Send secure invite by email
            </span>
            <input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="family@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Only this email can open the link — even if they forward it. They&apos;ll sign in with Clerk using the same address.
          </p>
          <button
            type="button"
            disabled={!tripId || busy || !recipientEmail.trim()}
            onClick={() => {
              void sendEmailInvite();
            }}
            className="min-h-[48px] w-full rounded-xl bg-[#007AFF] px-3 py-2 text-sm font-bold text-white hover:bg-[#0066DD] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send email invite"}
          </button>

          <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Link options
            </p>
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
            <label className="mt-2 flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <span>Read-only share link</span>
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(event) => setReadOnly(event.target.checked)}
              />
            </label>
            <label className="mt-2 flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <span>Include personal notes</span>
              <input
                type="checkbox"
                checked={showPersonalNotes}
                onChange={(event) => setShowPersonalNotes(event.target.checked)}
              />
            </label>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
            <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
              Copy open link (less secure)
            </summary>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Anyone with this URL can view the trip. Use email invite above to lock access to one person.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!tripId || busy}
                onClick={() => {
                  void createOrRefreshShare();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Generating..." : "Generate open link"}
              </button>
              {sharePayload && !sharePayload.intendedEmail ? (
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
          </details>

          {errorMessage ? <p className="text-xs text-red-500">{errorMessage}</p> : null}
          {successMessage ? <p className="text-xs text-emerald-600 dark:text-emerald-300">{successMessage}</p> : null}
        </div>

        {sharePayload ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Expires {new Date(sharePayload.expiresAt).toLocaleString()}
              {sharePayload.intendedEmail ? (
                <> · Locked to {sharePayload.intendedEmail}</>
              ) : (
                <> · Open link</>
              )}
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
            {sharePayload.intendedEmail ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void revokeLink();
                }}
                className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                Revoke this invite
              </button>
            ) : (
              <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                <QRCodeSVG value={sharePayload.url} size={172} />
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
