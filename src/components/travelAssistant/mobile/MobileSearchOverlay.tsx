"use client";

import { useEffect, useRef } from "react";
import { TripSearch, type TripSearchSelection } from "@/components/travelAssistant/TripSearch";

interface TripSearchTrip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  reservations: Array<{
    id: string;
    type: "flight" | "hotel" | "train" | "ride" | "dinner";
    title: string;
    confirmationCode: string;
    localTime: string;
  }>;
}

interface MobileSearchOverlayProps {
  open: boolean;
  trips: TripSearchTrip[];
  onClose: () => void;
  onSelectResult: (selection: TripSearchSelection) => void | Promise<void>;
}

export function MobileSearchOverlay({ open, trips, onClose, onSelectResult }: MobileSearchOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-50/95 backdrop-blur-md dark:bg-slate-950/95">
      <div
        ref={panelRef}
        className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]"
      >
        <div className="flex items-center justify-between gap-3 py-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Search</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full bg-white px-4 text-sm font-semibold text-[#007AFF] shadow-sm ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.08]"
          >
            Done
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Trips, flights, hotels, and confirmation codes
        </p>
        <div className="[&_input]:min-h-[48px] [&_input]:rounded-xl [&_input]:px-4 [&_input]:text-base [&_input]:font-medium">
          <TripSearch
            trips={trips}
            disabled={false}
            onSelectResult={async (selection) => {
              await onSelectResult(selection);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
