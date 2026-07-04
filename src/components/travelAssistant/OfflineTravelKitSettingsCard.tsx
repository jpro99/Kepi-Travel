"use client";

import Link from "next/link";
import { appleBtnPrimary, appleCaption, appleCard, appleCardTitle, appleMetadata } from "@/lib/ui/appleDesign";

interface OfflineTravelKitSettingsCardProps {
  savedAtLabel: string | null;
  reservationCount: number;
  syncing: boolean;
  onRefresh: () => void;
}

export function OfflineTravelKitSettingsCard({
  savedAtLabel,
  reservationCount,
  syncing,
  onRefresh,
}: OfflineTravelKitSettingsCardProps) {
  return (
    <article className={`${appleCard} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={appleCardTitle}>Offline travel kit</h2>
        {reservationCount > 0 ? (
          <span className="text-[13px] font-medium text-[var(--success)]">Ready</span>
        ) : (
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">Empty</span>
        )}
      </div>
      <p className={`${appleMetadata} mt-2`}>
        Your full itinerary, hotel address and phone, gate info, and ground transport plan — saved on this device for
        airplane mode and no-signal zones.
      </p>
      {savedAtLabel ? (
        <p className={`${appleCaption} mt-2`}>Last saved {savedAtLabel}</p>
      ) : (
        <p className={`${appleCaption} mt-2`}>Add bookings to your trip, then open Kepi once while online to save.</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <Link href="/offline-kit" className={`w-full min-h-[44px] text-center leading-[44px] ${appleBtnPrimary}`}>
          Open offline kit
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing || reservationCount === 0}
          className={`w-full min-h-[44px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-[15px] font-semibold text-[var(--text-primary)] disabled:opacity-50`}
        >
          {syncing ? "Saving..." : "Save trip for offline now"}
        </button>
      </div>
    </article>
  );
}
