"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface ShareModalProps {
  open: boolean;
  tripId: string | null;
  tripName: string | null;
  onClose: () => void;
  onCollaboratorJoined?: () => void;
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

interface TripInvitePayload {
  code: string;
  role: "viewer" | "editor";
  tripName: string;
  expiresAt: string;
}

interface TripCollaborator {
  userId: string;
  role: "viewer" | "editor";
  joinedAt: string;
  email: string | null;
  name: string | null;
}

type ShareMode = "invite" | "link";

export function ShareModal({
  open,
  tripId,
  tripName,
  onClose,
  onCollaboratorJoined,
}: ShareModalProps) {
  const [mode, setMode] = useState<ShareMode>("invite");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [readOnly, setReadOnly] = useState(true);
  const [showPersonalNotes, setShowPersonalNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [members, setMembers] = useState<TripCollaborator[]>([]);

  const loadCollaborators = useCallback(async (): Promise<void> => {
    if (!tripId) return;
    try {
      const response = await fetch(`/api/trips/collaborate?tripId=${encodeURIComponent(tripId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { members?: TripCollaborator[] };
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch {
      // degrade silently
    }
  }, [tripId]);

  const createTripInvite = useCallback(async (): Promise<void> => {
    if (!tripId || busy) return;
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/trips/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          role: inviteRole,
          ...(inviteEmail.trim() ? { email: inviteEmail.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as {
        inviteLink?: string;
        invite?: TripInvitePayload;
        emailSent?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.inviteLink || !payload.invite?.code) {
        throw new Error(payload.error ?? `Invite API returned ${response.status}`);
      }
      setInviteLink(payload.inviteLink);
      setInviteCode(payload.invite.code);
      setSuccessMessage(
        payload.emailSent
          ? `Invite sent to ${inviteEmail.trim()} — they can open and ${inviteRole === "editor" ? "edit" : "view"} the trip.`
          : `Invite ready — share the link so they can ${inviteRole === "editor" ? "edit" : "view"} the trip.`,
      );
      void loadCollaborators();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create trip invite.");
    } finally {
      setBusy(false);
    }
  }, [busy, inviteEmail, inviteRole, loadCollaborators, tripId]);

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
      setSuccessMessage(payload.existing ? "Existing share link loaded." : "Share link created.");
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
        body: JSON.stringify({ token: sharePayload.token }),
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

  const removeMember = async (memberUserId: string): Promise<void> => {
    if (!tripId || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/trips/collaborate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, memberUserId }),
      });
      if (!response.ok) {
        throw new Error("Could not remove collaborator.");
      }
      setMembers((current) => current.filter((member) => member.userId !== memberUserId));
      setSuccessMessage("Collaborator removed.");
      onCollaboratorJoined?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove collaborator.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !tripId) return;
    void loadCollaborators();
    if (mode === "link") {
      const timeout = window.setTimeout(() => {
        void createOrRefreshShare();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [createOrRefreshShare, loadCollaborators, mode, open, tripId]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        className="flex h-full max-h-[92dvh] w-full flex-col border border-slate-700 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:h-auto sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Share Trip</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tripName ? `Sharing ${tripName}` : "Select a trip to share."}
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

        <div className="mt-4 flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${
              mode === "invite" ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            Invite people
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${
              mode === "link" ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            Public link
          </button>
        </div>

        {mode === "invite" ? (
          <div className="mt-4 space-y-3 overflow-y-auto">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Invite someone with a Kepi account. They&apos;ll land directly in this trip after signing in.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["viewer", "editor"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setInviteRole(role)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm ${
                    inviteRole === role
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                >
                  <p className="font-bold">{role === "viewer" ? "View only" : "Can edit"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {role === "viewer"
                      ? "See flights, hotels, and itinerary."
                      : "Add and update bookings like you."}
                  </p>
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email (optional)
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="friend@example.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <button
              type="button"
              disabled={!tripId || busy}
              onClick={() => void createTripInvite()}
              className="w-full rounded-lg bg-sky-600 px-3 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {busy ? "Creating invite…" : "Create invite link"}
            </button>
            {inviteLink ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                {inviteCode ? (
                  <p className="text-xs text-slate-500">
                    Code: <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{inviteCode}</span>
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        setSuccessMessage("Invite link copied.");
                      } catch {
                        setErrorMessage("Clipboard unavailable.");
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : null}
            {members.length > 0 ? (
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">People with access</p>
                <ul className="mt-2 space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{member.name ?? member.email ?? "Collaborator"}</p>
                        <p className="text-xs text-slate-500">
                          {member.role === "editor" ? "Can edit" : "View only"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeMember(member.userId)}
                        className="shrink-0 text-xs font-semibold text-red-500"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-3 overflow-y-auto">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Anyone with the link can view a snapshot — no account required.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
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
                onClick={() => void createOrRefreshShare()}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
              >
                {busy ? "Generating…" : "Generate link"}
              </button>
              {sharePayload ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revokeLink()}
                  className="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Revoke link
                </button>
              ) : null}
            </div>
            {sharePayload ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
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
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                  <QRCodeSVG value={sharePayload.url} size={172} />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {errorMessage ? <p className="mt-3 text-xs text-red-500">{errorMessage}</p> : null}
        {successMessage ? (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-300">{successMessage}</p>
        ) : null}
      </section>
    </div>
  );
}
