"use client";

import { TripFlightSearch } from "@/components/travelAssistant/TripFlightSearch";
import { SEARCH_MODAL_PANEL } from "@/lib/ui/searchResponsive";
import type { FlightSearchPlan, PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

export interface FlightSearchModalProps {
  open: boolean;
  tripName?: string | null;
  plan: FlightSearchPlan | null;
  selectedLegs: PlannedFlightLeg[];
  onClose: () => void;
}

export function FlightSearchModal({
  open,
  tripName,
  plan,
  selectedLegs,
  onClose,
}: FlightSearchModalProps) {
  if (!open || !plan) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-3 md:p-4">
      <div className={`${SEARCH_MODAL_PANEL} max-h-[96dvh] w-full max-w-[98vw] sm:max-w-2xl lg:max-w-3xl`}>
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                Flights
              </p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white md:text-xl">
                {tripName ? `Book flights · ${tripName}` : "Find flights"}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{plan.summary}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close flight search"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
          <TripFlightSearch
            key={`${plan.mode}-${selectedLegs.map((leg) => leg.id).join("-")}`}
            plan={plan}
            selectedLegs={selectedLegs}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
