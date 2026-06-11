"use client";

import type { POIBubble } from "@/lib/airportNav/types";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

export interface PlacedBubble extends POIBubble {
  lng: number;
  lat: number;
}

interface BubbleLayerProps {
  map: maplibregl.Map;
  bubbles: PlacedBubble[];
  onTap: (poiId: string) => void;
}

function bubbleRingClass(state: POIBubble["state"]): string {
  switch (state) {
    case "primary":
      return "ring-2 ring-amber-400/90 shadow-amber-500/20";
    case "next":
      return "ring-2 ring-sky-400/80";
    case "completed":
      return "opacity-40 ring-1 ring-slate-400/40";
    case "ineligible":
      return "opacity-55 ring-1 ring-slate-500/50";
    default:
      return "ring-1 ring-white/20";
  }
}

function wireBubblePointer(element: HTMLElement, onActivate: () => void): void {
  element.style.pointerEvents = "auto";
  element.style.cursor = "pointer";
  element.style.touchAction = "manipulation";

  const stopMap = (event: Event) => {
    event.stopPropagation();
  };

  element.addEventListener("mousedown", stopMap);
  element.addEventListener("mouseup", stopMap);
  element.addEventListener("touchstart", stopMap, { passive: false });
  element.addEventListener("touchend", stopMap);
  element.addEventListener("pointerdown", stopMap);

  element.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    onActivate();
  });
}

export function BubbleLayer({ map, bubbles, onTap }: BubbleLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    if (!map) return undefined;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const bubble of bubbles) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `airport-nav-bubble max-w-[160px] rounded-2xl border border-white/15 bg-slate-900/75 px-3 py-2 text-left backdrop-blur-md shadow-lg transition ${bubbleRingClass(bubble.state)}`;
      element.innerHTML = `
        <p class="text-[11px] font-semibold text-white leading-tight">${bubble.title}</p>
        ${bubble.liveLine ? `<p class="mt-0.5 text-[10px] text-sky-200/90">${bubble.liveLine}</p>` : ""}
        ${bubble.eligibility && !bubble.eligibility.eligible ? `<p class="mt-0.5 text-[10px] text-slate-400">${bubble.eligibility.reason ?? "Verify access"}</p>` : ""}
      `;
      wireBubblePointer(element, () => onTapRef.current(bubble.poiId));

      const marker = new maplibregl.Marker({
        element,
        anchor: "bottom",
        className: "airport-nav-bubble-marker",
      })
        .setLngLat([bubble.lng, bubble.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [map, bubbles]);

  return null;
}
