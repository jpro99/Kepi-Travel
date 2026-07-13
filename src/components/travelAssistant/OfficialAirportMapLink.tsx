"use client";

import { getAirportWayfindingResource } from "@/lib/airportNav/officialWayfinding";
import { hasAirportLayout } from "@/lib/airportNav/getLayout";

interface OfficialAirportMapLinkProps {
  iata: string;
  compact?: boolean;
  className?: string;
  hasOfflineKepiLayout?: boolean;
}

export function OfficialAirportMapLink({
  iata,
  compact = false,
  className = "",
  hasOfflineKepiLayout,
}: OfficialAirportMapLinkProps) {
  const resource = getAirportWayfindingResource(iata);
  if (!resource) return null;
  const offlineKepiLayout = hasOfflineKepiLayout ?? hasAirportLayout(iata);

  return (
    <section
      data-testid="official-airport-map-link"
      className={`rounded-2xl border border-sky-300/30 bg-sky-950/85 text-white shadow-lg backdrop-blur ${compact ? "p-2.5" : "p-4"} ${className}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
        {resource.official ? "Official airport map" : "Airport map fallback"}
      </p>
      {!compact ? (
        <p className="mt-1 text-sm leading-snug text-sky-50/90">
          {resource.supportsStepByStep
            ? "Uses the airport’s own indoor map for current-location and step-by-step guidance."
            : "Opens a venue map for orientation. Indoor step-by-step guidance is not verified at this airport."}
        </p>
      ) : null}
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#f4c95d] px-3 text-center font-black text-[#0b1f3a] active:scale-[0.98] ${compact ? "text-[13px]" : "text-[16px]"}`}
      >
        {resource.label}
      </a>
      <p className={`mt-1.5 leading-snug text-sky-100/65 ${compact ? "text-[9px]" : "text-[11px]"}`}>
        {resource.provider} · Official map requires internet
        {offlineKepiLayout ? " · Kepi schematic remains available offline" : ""}
      </p>
    </section>
  );
}
