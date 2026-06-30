"use client";

import { useMemo } from "react";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
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
  const routeBanner = useMemo(() => {
    const route = buildTripTransportRoute(transportReservations);
    if (route.segments.length === 0) return null;
    const first = route.segments[0];
    const last = route.segments[route.segments.length - 1];
    const endToEnd =
      route.segments.length === 1
        ? `${first.fromLabel} → ${first.toLabel}`
        : `${first.fromLabel} → ${last.toLabel}`;
    const codes = route.segments.map((s) => `${s.fromCode} → ${s.toCode}`).join(" · ");
    return { endToEnd, codes };
  }, [transportReservations]);

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

      {routeBanner ? (
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-4 py-3.5 shadow-lg shadow-blue-900/20">
          <p className="text-[22px] font-black leading-tight text-white">{routeBanner.endToEnd}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-sky-100/90">{routeBanner.codes}</p>
        </div>
      ) : null}
    </header>
  );
}
