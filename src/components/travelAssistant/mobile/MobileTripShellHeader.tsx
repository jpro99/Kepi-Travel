"use client";

import { TripRouteBanner } from "@/components/travelAssistant/TripRouteBanner";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

interface MobileTripShellHeaderProps {
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  transportReservations: TransportRouteReservation[];
}

function formatTripDates(start: string, end: string): string {
  const fmt = (value: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
    if (!match) return "";
    return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const startLabel = fmt(start);
  const endLabel = fmt(end);
  if (!startLabel && !endLabel) return "";
  if (startLabel && endLabel && start !== end) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel;
}

export function MobileTripShellHeader({
  tripName,
  destination,
  startDate,
  endDate,
  transportReservations,
}: MobileTripShellHeaderProps) {
  return (
    <header className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Your trip</p>
        <h1 className="mt-0.5 text-[1.75rem] font-black leading-tight text-[var(--text-primary)]">{tripName}</h1>
        <p className="mt-1 text-[17px] text-[var(--text-muted)]">
          {destination || "Destination TBD"}
          {startDate || endDate
            ? ` · ${formatTripDates(startDate ?? "", endDate ?? "")}`
            : ""}
        </p>
      </div>

      <TripRouteBanner transportReservations={transportReservations} />
    </header>
  );
}
