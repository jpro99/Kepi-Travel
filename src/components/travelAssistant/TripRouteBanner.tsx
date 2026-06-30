"use client";

import { useMemo } from "react";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

interface TripRouteBannerProps {
  transportReservations: TransportRouteReservation[];
}

export function TripRouteBanner({ transportReservations }: TripRouteBannerProps) {
  const routeBanner = useMemo(() => {
    const route = buildTripTransportRoute(transportReservations);
    if (route.segments.length === 0) return null;
    const first = route.segments[0];
    const last = route.segments[route.segments.length - 1];
    const endToEnd =
      route.segments.length === 1
        ? `${first.fromLabel} → ${first.toLabel}`
        : `${first.fromLabel} → ${last.toLabel}`;
    const codes =
      route.segments.length === 1
        ? `${first.fromCode} → ${first.toCode}`
        : `${first.fromCode} → ${last.toCode}`;
    return { endToEnd, codes };
  }, [transportReservations]);

  if (!routeBanner) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-5 py-4 shadow-lg shadow-blue-900/20">
      <p className="text-2xl font-black leading-tight text-white">{routeBanner.endToEnd}</p>
      <p className="mt-0.5 text-base font-semibold text-sky-100/90">{routeBanner.codes}</p>
    </div>
  );
}
