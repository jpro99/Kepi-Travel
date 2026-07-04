"use client";

import Link from "next/link";

interface OfflineKitBannerProps {
  savedAtLabel: string | null;
  reservationCount: number;
}

export function OfflineKitBanner({ savedAtLabel, reservationCount }: OfflineKitBannerProps) {
  if (reservationCount === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 border-b border-amber-500/30 bg-[#2a1f0a] px-4 py-3 text-[#fef3c7] shadow-lg">
      <div className="mx-auto flex max-w-md items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">You&apos;re offline</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/90">
            Live updates are paused.{savedAtLabel ? ` Trip saved ${savedAtLabel}.` : ""} Open your offline kit for hotels,
            directions, and confirmations.
          </p>
        </div>
        <Link
          href="/offline-kit"
          className="shrink-0 rounded-lg bg-[#007AFF] px-3 py-2 text-xs font-bold text-white"
        >
          Open kit
        </Link>
      </div>
    </div>
  );
}
