"use client";

import { useMemo } from "react";
import type { TravelerSecurityCredentials } from "@/lib/airportNav/types";
import { getAirportProximity } from "@/lib/travelAssistant/airportGeo";
import { buildGateInstructions, getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import type { FamilyAirportPin } from "@/lib/family/familyAirportPins";
import { OfficialAirportMapLink } from "@/components/travelAssistant/OfficialAirportMapLink";
import { getAirportWayfindingResource } from "@/lib/airportNav/officialWayfinding";

interface AirportNavigatorFallbackProps {
  iata: string;
  gateCode: string | null;
  airlineName: string | null;
  flightNumber?: string | null;
  arrivalAirport?: string | null;
  departureTerminal?: string | null;
  departureClockLabel?: string | null;
  flightStatusLabel?: string | null;
  flightDelayed?: boolean;
  minutesToDeparture: number;
  proximityStatus?: string;
  userLat: number | null;
  userLon: number | null;
  credentials: TravelerSecurityCredentials;
  eligibleLoungeNames?: string[];
  fill?: boolean;
  onSwitchToFamilyView?: () => void;
  /** True when layout API failed (not merely unsupported). */
  layoutLoadFailed?: boolean;
  familyPins?: FamilyAirportPin[];
  onFamilyPinTap?: (memberId: string) => void;
}

function proximityLabel(status: string): string {
  if (status === "in-terminal") return "Inside the terminal area (GPS)";
  if (status === "at-airport") return "At the airport (GPS)";
  if (status === "away") return "Not at the airport yet";
  return "Locating…";
}

export function AirportNavigatorFallback({
  iata,
  gateCode,
  airlineName,
  flightNumber,
  arrivalAirport,
  departureTerminal,
  departureClockLabel,
  flightStatusLabel,
  flightDelayed = false,
  minutesToDeparture,
  proximityStatus = "away",
  userLat,
  userLon,
  credentials,
  eligibleLoungeNames = [],
  fill = false,
  onSwitchToFamilyView,
  layoutLoadFailed = false,
  familyPins = [],
  onFamilyPinTap,
}: AirportNavigatorFallbackProps) {
  const code = iata.trim().toUpperCase();
  const nav = getAirportNav(code);
  const officialWayfinding = getAirportWayfindingResource(code);

  const proximity = useMemo(
    () => getAirportProximity(userLat, userLon, code),
    [userLat, userLon, code],
  );

  const guide = useMemo(
    () =>
      buildGateInstructions(
        code,
        gateCode ?? undefined,
        departureTerminal ?? undefined,
        credentials.clear,
        credentials.tsaPreCheck,
        false,
      ),
    [code, gateCode, departureTerminal, credentials.clear, credentials.tsaPreCheck],
  );

  const checkInLine = airlineName?.trim()
    ? `Check in with ${airlineName.trim()} — app, kiosk, or counter`
    : "Check in — airline app, kiosk, or counter";

  return (
    <div
      data-testid="airport-nav-fallback"
      className={
        fill
          ? "relative flex h-full w-full flex-col overflow-y-auto bg-gradient-to-b from-[#0b1f3a] to-[#061528] text-white"
          : "relative overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-b from-[#0b1f3a] to-[#061528] text-white"
      }
      style={fill ? undefined : { maxHeight: 520 }}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
            {layoutLoadFailed ? "Kepi indoor map unavailable" : "Kepi indoor map coming soon"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-50/95">
            {layoutLoadFailed ? (
              <>
                We couldn&apos;t load the terminal map for <span className="font-bold">{code}</span> right now.
                Use the checklist below — we&apos;ll retry when you reopen the map.
              </>
            ) : (
              <>
                Turn-by-turn terminal routing isn&apos;t live at <span className="font-bold">{code}</span> yet.
                {" "}Kepi will switch this screen to the stored indoor map when its airport package is published.
              </>
            )}
          </p>
        </div>

        <OfficialAirportMapLink iata={code} />

        <div className="rounded-2xl bg-black/35 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80">
                {nav?.name ?? code} · {code}
              </p>
              <p className="mt-1 text-xl font-black">
                Gate {gateCode?.toUpperCase() ?? "TBD"}
                {departureTerminal ? (
                  <span className="ml-2 text-sm font-semibold text-sky-200/80">Term {departureTerminal}</span>
                ) : null}
              </p>
              {flightNumber ? (
                <p className="mt-0.5 text-sm text-slate-300">
                  {flightNumber}
                  {arrivalAirport ? ` → ${arrivalAirport}` : ""}
                  {departureClockLabel ? ` · ${departureClockLabel}` : ""}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className={`text-lg font-black ${minutesToDeparture < 45 ? "text-amber-300" : "text-white"}`}>
                {minutesToDeparture > 0 ? `${Math.round(minutesToDeparture)}m` : "Now"}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">to departure</p>
              {flightStatusLabel ? (
                <p className={`mt-1 text-xs font-bold ${flightDelayed ? "text-amber-300" : "text-emerald-300"}`}>
                  {flightStatusLabel}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-sky-100/80">
            📍 {proximityLabel(proximityStatus || proximity.status)}
          </p>
        </div>

        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/80">Your path today</p>
          <ol className="mt-2 space-y-2">
            <li className="flex gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <span className="text-lg" aria-hidden>🧳</span>
              <div>
                <p className="text-sm font-semibold">{checkInLine}</p>
                <p className="text-xs text-slate-400">Drop bags if needed, then head to security</p>
              </div>
            </li>
            {guide.steps.map((step, index) => (
              <li key={`${step.text}-${index}`} className="flex gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                <span className="text-lg" aria-hidden>{step.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{step.text}</p>
                  {step.detail ? <p className="text-xs text-slate-400">{step.detail}</p> : null}
                  {step.minutes > 0 ? (
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      ~{step.minutes} min
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {guide.totalMinutes > 0 ? (
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Estimated {guide.totalMinutes} min after you&apos;re at security
            </p>
          ) : null}
        </section>

        {eligibleLoungeNames.length > 0 ? (
          <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Lounges you may use</p>
            <ul className="mt-2 space-y-1">
              {eligibleLoungeNames.map((name) => (
                <li key={name} className="text-sm text-sky-50">
                  🛋 {name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-sky-100/70">Ask staff for the nearest entrance — indoor map routing is next.</p>
          </section>
        ) : null}

        {familyPins.length > 0 ? (
          <section
            data-testid="airport-family-chip-strip"
            className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">Family at {code}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {familyPins.map((pin) => (
                <button
                  key={pin.memberId}
                  type="button"
                  data-testid={`airport-family-chip-${pin.memberId}`}
                  onClick={() => onFamilyPinTap?.(pin.memberId)}
                  className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm font-semibold text-white active:opacity-90"
                  style={{ opacity: pin.stale ? 0.65 : 1 }}
                >
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ background: pin.stale ? "#64748b" : pin.color }}
                  />
                  {pin.name}
                  {pin.proximityStatus === "in-terminal" ? " · in terminal" : " · at airport"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-emerald-100/75">GPS only here — tap a name to open the family map.</p>
          </section>
        ) : null}

        {nav?.generalNotes ? (
          <section className="rounded-2xl bg-white/5 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Airport tip</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-200">{nav.generalNotes}</p>
          </section>
        ) : null}

        {onSwitchToFamilyView ? (
          <button
            type="button"
            data-testid="airport-fallback-family-cta"
            onClick={onSwitchToFamilyView}
            className="w-full rounded-2xl bg-[#f4c95d] px-4 py-3.5 text-sm font-bold text-[#0b1f3a] shadow-lg active:opacity-90"
          >
            👪 Find family on the map
          </button>
        ) : null}

        <p className="text-center text-[10px] leading-relaxed text-slate-500">
          {officialWayfinding?.official
            ? `Kepi keeps the trip context; ${officialWayfinding.provider} provides the verified live airport map.`
            : `Kepi GPS geofencing is active. Exact indoor positioning for ${code} is not verified — use airport signs and staff as the final word.`}
        </p>
      </div>
    </div>
  );
}
