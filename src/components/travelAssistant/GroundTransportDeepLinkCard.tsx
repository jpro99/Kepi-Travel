"use client";

import type { GroundTransportDeepLinks } from "@/lib/travelAssistant/groundTransportDeepLinks";
import { buildGroundTransportDeepLinks } from "@/lib/travelAssistant/groundTransportDeepLinks";

interface GroundTransportDeepLinkCardProps {
  links?: GroundTransportDeepLinks;
  pickupLabel?: string;
  dropoffLabel?: string;
  pickupLat?: number;
  pickupLon?: number;
  dropoffLat?: number;
  dropoffLon?: number;
}

export function GroundTransportDeepLinkCard(props: GroundTransportDeepLinkCardProps) {
  const links =
    props.links ??
    (typeof props.pickupLat === "number" &&
    typeof props.pickupLon === "number" &&
    typeof props.dropoffLat === "number" &&
    typeof props.dropoffLon === "number" &&
    props.pickupLabel &&
    props.dropoffLabel
      ? buildGroundTransportDeepLinks({
          pickup: { label: props.pickupLabel, lat: props.pickupLat, lon: props.pickupLon },
          dropoff: { label: props.dropoffLabel, lat: props.dropoffLat, lon: props.dropoffLon },
        })
      : null);

  if (!links) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-900 dark:text-white">
        Book ride · {links.pickupLabel} → {links.dropoffLabel}
      </p>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Opens Uber or Lyft with your trip locations prefilled.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={links.uberUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-black px-2.5 py-1.5 text-xs font-bold text-white"
        >
          Open Uber
        </a>
        <a
          href={links.lyftUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-[#FF00BF] px-2.5 py-1.5 text-xs font-bold text-white"
        >
          Open Lyft
        </a>
      </div>
    </div>
  );
}
