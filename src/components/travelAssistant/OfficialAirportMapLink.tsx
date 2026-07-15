"use client";

import {
  getAirportWayfindingResource,
  wayfindingHonestyTier,
} from "@/lib/airportNav/officialWayfinding";
import { hasAirportLayout } from "@/lib/airportNav/getLayout";

interface OfficialAirportMapLinkProps {
  iata: string;
  compact?: boolean;
  className?: string;
  /** When true, Kepi already has a layout for this airport — that map is primary. */
  hasOfflineKepiLayout?: boolean;
}

/**
 * External airport-map link with honesty tiers (KEPI_DESIGN_LAW M12 / M34).
 *
 * A verified step-by-step resource (SEA Atrius, etc.) may look confident.
 * A Google venue-search fallback must NOT — especially at airports where Kepi's
 * own schematic is the traveler's real primary tool. Never let a weak fallback
 * dress up as live indoor directions.
 */
export function OfficialAirportMapLink({
  iata,
  compact = false,
  className = "",
  hasOfflineKepiLayout,
}: OfficialAirportMapLinkProps) {
  const resource = getAirportWayfindingResource(iata);
  if (!resource) return null;
  const kepiPrimary = hasOfflineKepiLayout ?? hasAirportLayout(iata);
  const tier = wayfindingHonestyTier(resource);
  const code = resource.iata;

  if (tier === "strong") {
    return (
      <section
        data-testid="official-airport-map-link"
        data-wayfinding-tier="strong"
        className={`rounded-2xl border border-sky-300/30 bg-sky-950/85 text-white shadow-lg backdrop-blur ${compact ? "p-2.5" : "p-4"} ${className}`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
          Verified live indoor map
        </p>
        {!compact ? (
          <p className="mt-1 text-sm leading-snug text-sky-50/90">
            Uses the airport&apos;s own indoor map for current-location and step-by-step guidance.
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
          {resource.provider} · Requires internet
          {kepiPrimary ? " · Kepi map also available offline" : ""}
        </p>
      </section>
    );
  }

  // Kepi has a layout: that map is the primary tool. External link is secondary
  // orientation only — never a gold "directions" CTA that implies step-by-step.
  if (kepiPrimary) {
    const label =
      tier === "official_static"
        ? `Open ${code} airport map (orientation)`
        : `Search Google for ${code} terminal map`;
    return (
      <section
        data-testid="official-airport-map-link"
        data-wayfinding-tier={tier}
        data-kepi-primary="true"
        className={`rounded-2xl border border-slate-500/35 bg-slate-900/70 text-slate-100 ${compact ? "p-2.5" : "p-3.5"} ${className}`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Extra reference · not step-by-step
        </p>
        {!compact ? (
          <p className="mt-1 text-sm leading-snug text-slate-200/90">
            Kepi&apos;s map is your primary guide here. This opens{" "}
            {tier === "official_static" ? "the airport&apos;s static/orientation map" : "a venue search"}{" "}
            for extra context — not verified indoor turn-by-turn.
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Kepi map is primary. External link is orientation only.
          </p>
        )}
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-500/50 bg-slate-800/80 px-3 text-center font-semibold text-slate-100 active:scale-[0.98] ${compact ? "text-[12px]" : "text-[14px]"}`}
        >
          {label}
        </a>
        <p className={`mt-1.5 leading-snug text-slate-500 ${compact ? "text-[9px]" : "text-[11px]"}`}>
          {resource.provider}
          {tier === "weak" ? " · Not an official indoor map" : " · Not step-by-step verified"}
        </p>
      </section>
    );
  }

  // No Kepi layout yet + weak/static external: honest, de-emphasized — never gold.
  const label =
    tier === "official_static"
      ? `Open ${code} airport map (orientation)`
      : `Search for ${code} terminal map`;
  return (
    <section
      data-testid="official-airport-map-link"
      data-wayfinding-tier={tier}
      data-kepi-primary="false"
      className={`rounded-2xl border border-amber-400/25 bg-amber-950/40 text-amber-50 ${compact ? "p-2.5" : "p-4"} ${className}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200/90">
        {tier === "official_static" ? "Airport map (orientation only)" : "No verified indoor map yet"}
      </p>
      {!compact ? (
        <p className="mt-1 text-sm leading-snug text-amber-50/90">
          {tier === "official_static"
            ? `An airport map is available for orientation, but indoor step-by-step guidance is not verified for ${code}. Follow posted signs.`
            : `No airport-owned step-by-step map is verified for ${code}. Use signs and staff; a venue search is orientation only — not live indoor directions.`}
        </p>
      ) : null}
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-400/40 bg-amber-900/50 px-3 text-center font-bold text-amber-50 active:scale-[0.98] ${compact ? "text-[13px]" : "text-[15px]"}`}
      >
        {label}
      </a>
      <p className={`mt-1.5 leading-snug text-amber-100/55 ${compact ? "text-[9px]" : "text-[11px]"}`}>
        {resource.provider}
        {tier === "weak" ? " · Google venue search, not official indoor wayfinding" : " · Requires internet"}
      </p>
    </section>
  );
}
