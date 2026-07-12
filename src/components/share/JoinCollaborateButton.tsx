"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface JoinCollaborateButtonProps {
  token: string;
  tripName: string;
}

export function JoinCollaborateButton({ token, tripName }: JoinCollaborateButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  const handleJoin = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);
    try {
      const response = await fetch("/api/trips/share/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, setActive: true }),
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        redirectTo?: string;
        tripId?: string;
      };
      if (!response.ok) {
        if (payload.code === "upgrade-required" || response.status === 402) {
          setNeedsUpgrade(true);
          setError(payload.error ?? "Both of you need a paid Kepi plan to edit together.");
          return;
        }
        throw new Error(payload.error ?? `Could not join trip (${response.status})`);
      }
      router.push(payload.redirectTo ?? `/travel-assistant?tripId=${payload.tripId ?? ""}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join trip.");
    } finally {
      setBusy(false);
    }
  }, [busy, router, token]);

  return (
    <div className="mb-6 rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4">
      <p className="text-sm font-bold text-sky-100">Edit this trip together</p>
      <p className="mt-1 text-xs leading-relaxed text-sky-100/80">
        Open <strong>{tripName}</strong> in your Kepi account. You and the owner can both add flights,
        hotels, and notes — same trip, shared.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleJoin()}
        className="mt-3 min-h-[48px] w-full rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "Opening…" : "Open in My Trips & edit together"}
      </button>
      {needsUpgrade ? (
        <p className="mt-2 text-center text-xs text-amber-200">
          Need Pro or Lifetime?{" "}
          <Link href="/billing" className="font-semibold underline">
            Upgrade here
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
