"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appleBody, appleBtnPrimary, appleBtnText, appleCaption, appleCard, appleCardTitle } from "@/lib/ui/appleDesign";

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
    <div className={`mb-6 p-4 ${appleCard}`}>
      <p className={appleCardTitle}>Edit this trip together</p>
      <p className={`${appleBody} mt-1 text-[15px] text-[#6E6E73]`}>
        Open <strong>{tripName}</strong> in your Kepi account. You and the owner can both add flights,
        hotels, and notes — same trip, shared.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleJoin()}
        className={`mt-3 min-h-[48px] w-full ${appleBtnPrimary} disabled:opacity-60`}
      >
        {busy ? "Opening…" : "Open in My Trips & edit together"}
      </button>
      {needsUpgrade ? (
        <p className={`${appleCaption} mt-2 text-center`}>
          Need Pro or Lifetime?{" "}
          <Link href="/billing" className={appleBtnText}>
            Upgrade here
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[var(--destructive)]">{error}</p> : null}
    </div>
  );
}
