"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { appleBtnPrimary, appleCaption, appleCard, appleCardTitle } from "@/lib/ui/appleDesign";

/**
 * In-app account deletion (Apple Guideline 5.1.1(v)).
 */
export function DeleteAccountSection() {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    if (busy) return;
    if (confirmation.trim() !== "DELETE") {
      setError('Type DELETE in capital letters to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Deletion failed (${response.status})`);
      }
      await signOut({ redirectUrl: "/" });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete account.");
      setBusy(false);
    }
  };

  return (
    <article className={`${appleCard} p-4`}>
      <h2 className={appleCardTitle}>Delete account</h2>
      <p className={`${appleCaption} mt-1`}>
        Permanently delete your Kepi account, trips, and stored data. This cannot be undone. Active
        Stripe subscriptions are cancelled when possible.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full min-h-[48px] rounded-xl border border-[var(--destructive)] px-3 text-[15px] font-semibold text-[var(--destructive)]"
        >
          Delete my account…
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className={`${appleCaption} mb-1 block`}>
              Type <span className="font-semibold text-[var(--text-primary)]">DELETE</span> to confirm
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="w-full min-h-[48px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 text-[16px] text-[var(--text-primary)]"
              placeholder="DELETE"
            />
          </label>
          {error ? <p className="text-[13px] text-[var(--destructive)]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirmation("");
                setError(null);
              }}
              className="min-h-[48px] flex-1 rounded-xl border border-[var(--border-default)] px-3 text-[15px] font-semibold text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || confirmation.trim() !== "DELETE"}
              onClick={() => {
                void handleDelete();
              }}
              className={`min-h-[48px] flex-1 rounded-xl bg-[var(--destructive)] px-3 text-[15px] font-semibold text-white disabled:opacity-50 ${appleBtnPrimary}`}
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
