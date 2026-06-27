"use client";

import { TripFlightLegPicker } from "@/components/travelAssistant/TripFlightLegPicker";
import { TripHotelCityPicker } from "@/components/travelAssistant/TripHotelCityPicker";
import type { FlightSearchPlan, PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";

interface TripPlanBuildStripProps {
  tripName?: string | null;
  plannedStayCities: PlannedStayCity[];
  plannedFlightLegs: PlannedFlightLeg[];
  onPickCity: (city: PlannedStayCity) => void;
  onSearchFlights: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onOpenHotelsTab?: () => void;
  onOpenFlightsTab?: () => void;
}

export function TripPlanBuildStrip({
  tripName,
  plannedStayCities,
  plannedFlightLegs,
  onPickCity,
  onSearchFlights,
  onOpenHotelsTab,
  onOpenFlightsTab,
}: TripPlanBuildStripProps) {
  if (plannedStayCities.length === 0 && plannedFlightLegs.length === 0) return null;

  const hotelsNeeded = plannedStayCities.filter((city) => city.status === "needed").length;
  const flightsNeeded = plannedFlightLegs.filter((leg) => leg.status === "needed").length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-200/60 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-3 dark:border-sky-800 dark:from-sky-950/40 dark:to-indigo-950/40">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
          Build your trip
        </p>
        <h3 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
          Your dates are set — let&apos;s book the fun parts ✨
        </h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {hotelsNeeded > 0 ? `${hotelsNeeded} hotel${hotelsNeeded === 1 ? "" : "s"} to find` : "Hotels looking good"}
          {" · "}
          {flightsNeeded > 0 ? `${flightsNeeded} flight${flightsNeeded === 1 ? "" : "s"} to search` : "Flights on track"}
        </p>
        {(onOpenHotelsTab || onOpenFlightsTab) && (hotelsNeeded > 0 || flightsNeeded > 0) ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {onOpenHotelsTab && hotelsNeeded > 0 ? (
              <button
                type="button"
                onClick={onOpenHotelsTab}
                className="rounded-full bg-sky-600 px-3 py-1 text-[10px] font-bold text-white"
              >
                Open Hotels tab
              </button>
            ) : null}
            {onOpenFlightsTab && flightsNeeded > 0 ? (
              <button
                type="button"
                onClick={onOpenFlightsTab}
                className="rounded-full border border-sky-300 bg-white px-3 py-1 text-[10px] font-bold text-sky-800 dark:border-sky-600 dark:bg-slate-900 dark:text-sky-200"
              >
                Open Flights tab
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {plannedStayCities.length > 0 ? (
        <TripHotelCityPicker cities={plannedStayCities} tripName={tripName} onPickCity={onPickCity} />
      ) : null}

      {plannedFlightLegs.length > 0 ? (
        <TripFlightLegPicker legs={plannedFlightLegs} tripName={tripName} onSearch={onSearchFlights} />
      ) : null}
    </div>
  );
}
