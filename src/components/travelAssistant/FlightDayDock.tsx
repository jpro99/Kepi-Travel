"use client";

import {
  buildFlightDayDockModel,
  selectFlightDayDockFlight,
  shouldPinFlightDayDock,
} from "@/lib/travelAssistant/flightDayDock";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { FlightStatusTrustInput } from "@/lib/travelAssistant/flightStatusTrustLine";

interface DockReservation {
  id: string;
  type: string;
  localTime: string;
  timezone?: string;
  flightNumber?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightStatus?: string;
}

interface FlightDayDockProps {
  reservations: DockReservation[];
  journeyPhase: JourneyPhase;
  liveStatus?: Record<string, FlightStatusTrustInput & { departureGate?: string }>;
  onOpenAirportMode: () => void;
  onOpenFlight: (reservationId: string) => void;
  className?: string;
}

/**
 * G64 — Pinned flight strip: flight #, route, gate — one tap, survives refresh.
 */
export function FlightDayDock({
  reservations,
  journeyPhase,
  liveStatus,
  onOpenAirportMode,
  onOpenFlight,
  className = "",
}: FlightDayDockProps) {
  const nowMs = Date.now();
  const flight = selectFlightDayDockFlight(reservations, journeyPhase, nowMs);
  if (!shouldPinFlightDayDock(flight, journeyPhase, nowMs) || !flight) return null;

  const live = liveStatus?.[flight.id ?? ""];
  const model = buildFlightDayDockModel(
    flight,
    journeyPhase,
    live
      ? {
          flightStatus: live.flightStatus,
          departureGate: live.departureGate,
          delayMinutes: live.delayMinutes,
          checkedAt: live.checkedAt,
          busy: live.busy,
          error: live.error,
          bookedGate: flight.flightDepartureGate,
          bookedStatus: flight.flightStatus,
          departureIata: flight.flightDepartureAirport,
        }
      : {
          bookedGate: flight.flightDepartureGate,
          bookedStatus: flight.flightStatus,
          departureIata: flight.flightDepartureAirport,
        },
    nowMs,
  );

  const handleTap = () => {
    if (model.phase === "in-flight" || model.phase === "landed" || model.phase === "at-airport") {
      onOpenAirportMode();
      return;
    }
    onOpenFlight(model.reservationId);
  };

  return (
    <div
      className={`pointer-events-auto fixed inset-x-0 z-[99990] px-3 ${className}`}
      style={{
        bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      }}
      data-testid="flight-day-dock"
    >
      <button
        type="button"
        onClick={handleTap}
        className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/95 px-4 py-3 text-left shadow-[0_8px_32px_rgba(0,0,0,0.14)] backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95"
        aria-label={`${model.title}. ${model.detail ?? model.ctaLabel}`}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px]"
          style={{
            background:
              model.phase === "in-flight"
                ? "linear-gradient(135deg, #5856D6, #007AFF)"
                : model.phase === "landed"
                  ? "linear-gradient(135deg, #34C759, #30B350)"
                  : "linear-gradient(135deg, #007AFF, #0051D5)",
          }}
          aria-hidden="true"
        >
          {model.phase === "in-flight" ? "✈️" : model.phase === "landed" ? "🛬" : "🛫"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
            {model.eyebrow}
          </p>
          <p className="truncate text-[17px] font-semibold leading-snug text-[#1D1D1F] dark:text-slate-100">
            {model.title}
          </p>
          {model.detail ? (
            <p className="truncate text-[14px] text-[#007AFF]">{model.detail}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[13px] font-semibold text-[#007AFF]">{model.ctaLabel}</span>
      </button>
    </div>
  );
}
