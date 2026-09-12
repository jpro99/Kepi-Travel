"use client";

/**
 * Shared active-flight selection (extracted from AirportMode so the Map page
 * and any future surface select the SAME flight by the SAME rules — never two
 * sources of truth).
 *
 *  - toUtcMs / selectActiveFlight: pure, identical to AirportMode's original
 *    logic (flight within −60min … +180min of now, earliest first)
 *  - useActiveFlight(): self-fetching variant for surfaces that don't already
 *    hold reservations (fetches /api/trips, flattens, 30s re-selection tick)
 *  - useNavigatorCredentials(): travel-profile-backed PreCheck/CLEAR state +
 *    persistence, matching AirportMode's save shape
 *  - deriveEligibleLounges(): airline-status lounge eligibility for an airport
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findProgram,
  findTier,
  getLoungesForAirport,
} from "@/lib/travelAssistant/airlineStatus";
import type { TravelProfile } from "@/app/api/travel-profile/route";
import { evaluateLoungeEligibility, listLoungesForAirport } from "@/lib/airportNav/loungeRules";
import { matchAirlineStatusForFlight } from "@/lib/travelAssistant/syncTravelBenefits";
import {
  deriveAirportDayCoachMode,
  type AirportDayCoachMode,
} from "@/lib/travelAssistant/airportDayCoach";
import {
  computeJourneyPhase,
  type JourneyPhase,
  type JourneyReservation,
} from "@/lib/travelAssistant/journeyPhase";
import { resolveArrivalHotelLabel } from "@/lib/travelAssistant/airportSpotlightContext";
import {
  flightDepartureUtcMs,
  formatTravelDayFlightLabel,
  selectNextRemainingFlight,
  selectTravelDayDepartureFlight,
  type TravelDayFlightPick,
} from "@/lib/travelAssistant/flightSort";
import {
  flightArrivalUtcMs,
  REMAINING_ARRIVAL_ACTIVE_MS,
  selectActiveArrivalFlight,
  selectRemainingJourneyFlight,
} from "@/lib/travelAssistant/remainingJourneyFlight";
export interface FlightReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightStatus?: string;
  notes?: string;
}

export interface ActiveFlight {
  f: FlightReservation;
  utcMs: number;
}

/** @deprecated Prefer flightDepartureUtcMs — kept for existing tests/imports. */
export function toUtcMs(localTime: string, timezone?: string): number {
  return flightDepartureUtcMs({ localTime, timezone });
}

const WINDOW_AHEAD_MIN = 12 * 60; // 12h — early airport arrival still gets navigator
const WINDOW_BEHIND_MIN = 60;

function isInActiveDepartureWindow(
  depUtcMs: number,
  arrUtcMs: number,
  nowMs: number,
  aheadMinutes: number,
  behindMinutes: number,
): boolean {
  const minutesUntilDep = (depUtcMs - nowMs) / 60_000;
  if (minutesUntilDep > aheadMinutes) return false;
  if (minutesUntilDep >= 0) return true;
  if (!Number.isNaN(arrUtcMs) && nowMs < arrUtcMs + REMAINING_ARRIVAL_ACTIVE_MS) return true;
  return (nowMs - depUtcMs) / 60_000 < behindMinutes;
}

/** Live airport mode: departure within −60min … +12h ahead, through arrival (G64). */
export function selectActiveFlight(
  reservations: FlightReservation[],
  nowMs: number,
  options?: { aheadMinutes?: number; behindMinutes?: number },
): ActiveFlight | null {
  const ahead = options?.aheadMinutes ?? WINDOW_AHEAD_MIN;
  const behind = options?.behindMinutes ?? WINDOW_BEHIND_MIN;
  return (
    reservations
      .filter((r) => r.type === "flight")
      .map((f) => ({
        f,
        utcMs: flightDepartureUtcMs(f),
        arrUtcMs: flightArrivalUtcMs(f),
      }))
      .filter(
        ({ utcMs, arrUtcMs }) =>
          !isNaN(utcMs) &&
          isInActiveDepartureWindow(utcMs, arrUtcMs, nowMs, ahead, behind),
      )
      .sort((a, b) => a.utcMs - b.utcMs)[0] ?? null
  );
}

/** Shared navigator pick — AirportMode, Map, and FlightDayDock use the same rules. */
export function selectNavigatorFlight(
  reservations: FlightReservation[],
  nowMs: number,
  journeyPhase: JourneyPhase,
  options?: {
    preferredIata?: string | null;
    preferredMode?: "depart" | "arrive" | null;
  },
): ActiveFlight | null {
  const preferredIata = options?.preferredIata?.trim().toUpperCase() ?? null;
  const preferredMode = options?.preferredMode ?? null;

  const pinnedFlight = preferredIata
    ? selectFlightForAirportIata(reservations, preferredIata, nowMs, preferredMode)
    : null;
  if (pinnedFlight) return pinnedFlight;

  if (journeyPhase.kind === "airborne") {
    const f = journeyPhase.onFlight as FlightReservation;
    const utcMs = flightDepartureUtcMs(f);
    return { f, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
  }

  const activeFlight = selectActiveFlight(reservations, nowMs);

  if (activeFlight) {
    const justLanded =
      journeyPhase.kind === "just-landed"
        ? (journeyPhase.flight as FlightReservation)
        : null;
    if (!justLanded || justLanded.id !== activeFlight.f.id) {
      return activeFlight;
    }
  }

  const arrivalRemaining = selectActiveArrivalFlight(reservations, nowMs);
  if (arrivalRemaining) {
    const utcMs = flightArrivalUtcMs(arrivalRemaining);
    return { f: arrivalRemaining, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
  }

  if (journeyPhase.kind === "just-landed") {
    const f = journeyPhase.flight as JourneyReservation as FlightReservation;
    const utcMs = flightArrivalUtcMs(f);
    if (!Number.isNaN(utcMs)) {
      return { f, utcMs };
    }
  }

  const remainingJourneyFlight = selectRemainingJourneyFlight(reservations, nowMs);
  if (remainingJourneyFlight) {
    const utcMs = flightDepartureUtcMs(remainingJourneyFlight);
    return { f: remainingJourneyFlight as FlightReservation, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
  }

  const preview = selectPreviewAirportFlight(reservations, nowMs);
  return preview;
}

/**
 * Preview mode: earliest upcoming departure on the trip — any lead time.
 * Lets travelers explore the terminal map days or weeks before travel day.
 */
export function selectPreviewAirportFlight(
  reservations: FlightReservation[],
  nowMs: number,
): ActiveFlight | null {
  const todayPick = selectTravelDayDepartureFlight(reservations, nowMs);
  if (todayPick) {
    return { f: todayPick.f as FlightReservation, utcMs: todayPick.utcMs };
  }

  const next = selectNextRemainingFlight(reservations, nowMs);
  if (!next) return null;
  const utcMs = flightDepartureUtcMs(next);
  return { f: next as FlightReservation, utcMs };
}

/** Mirrors page.tsx's onboarding-placeholder rule (provider/notes markers). */
function isPlaceholderReservation(r: FlightReservation): boolean {
  const provider = (r.provider ?? "").trim().toLowerCase();
  const notes = (r.notes ?? "").trim().toLowerCase();
  return provider === "onboarding setup" || notes.includes("created during onboarding");
}

interface TripsResponse {
  trips?: { id?: string; reservations?: FlightReservation[] }[];
}

export interface UseActiveFlightOptions {
  /** Scope flight selection to one trip (live-map deep links). */
  tripId?: string | null;
  /** Pin airport mode to this IATA (departure or arrival leg). */
  preferredIata?: string | null;
  /** When set, prefer arrival vs departure match for preferredIata. */
  preferredMode?: "depart" | "arrive" | null;
}

function isInDepartureNavigatorWindow(depUtcMs: number, nowMs: number): boolean {
  const graceMs = WINDOW_BEHIND_MIN * 60_000;
  const aheadMs = WINDOW_AHEAD_MIN * 60_000;
  return depUtcMs >= nowMs - graceMs && depUtcMs <= nowMs + aheadMs;
}

function isInArrivalCoachWindow(arrUtcMs: number, nowMs: number): boolean {
  return nowMs >= arrUtcMs && nowMs < arrUtcMs + REMAINING_ARRIVAL_ACTIVE_MS;
}

/** Pick the best flight for a pinned departure airport on this trip. */
export function selectFlightForDepartureIata(
  reservations: FlightReservation[],
  iata: string,
  nowMs: number,
): ActiveFlight | null {
  const code = iata.trim().toUpperCase();
  if (!code) return null;
  const graceMs = WINDOW_BEHIND_MIN * 60_000;
  const aheadMs = WINDOW_AHEAD_MIN * 60_000;
  const candidates = reservations
    .filter(
      (r) =>
        r.type === "flight" &&
        r.flightDepartureAirport?.trim().toUpperCase() === code,
    )
    .map((f) => ({ f, utcMs: flightDepartureUtcMs(f) }))
    .filter(({ utcMs }) => !isNaN(utcMs))
    .sort((a, b) => a.utcMs - b.utcMs);
  const inWindow = candidates.filter(
    ({ utcMs }) => utcMs >= nowMs - graceMs && utcMs <= nowMs + aheadMs,
  );
  if (inWindow[0]) return inWindow[0];
  return candidates.find(({ utcMs }) => utcMs >= nowMs - graceMs) ?? null;
}

/** Pick the best flight for a pinned arrival airport (FCO first-mile, etc.). */
export function selectFlightForArrivalIata(
  reservations: FlightReservation[],
  iata: string,
  nowMs: number,
): ActiveFlight | null {
  const code = iata.trim().toUpperCase();
  if (!code) return null;
  let best: ActiveFlight | null = null;
  for (const r of reservations) {
    if (r.type !== "flight") continue;
    if (r.flightArrivalAirport?.trim().toUpperCase() !== code) continue;
    const arrMs = flightArrivalUtcMs(r);
    if (Number.isNaN(arrMs) || !isInArrivalCoachWindow(arrMs, nowMs)) continue;
    if (!best || arrMs > best.utcMs) best = { f: r, utcMs: arrMs };
  }
  return best;
}

/** Match a pinned IATA to the correct leg — never resurrect stale inbound legs. */
export function selectFlightForAirportIata(
  reservations: FlightReservation[],
  iata: string,
  nowMs: number,
  mode?: "depart" | "arrive" | null,
): ActiveFlight | null {
  if (mode === "arrive") {
    return selectFlightForArrivalIata(reservations, iata, nowMs);
  }
  if (mode === "depart") {
    return selectFlightForDepartureIata(reservations, iata, nowMs);
  }
  const arrival = selectFlightForArrivalIata(reservations, iata, nowMs);
  const departure = selectFlightForDepartureIata(reservations, iata, nowMs);
  if (arrival && departure) {
    const inArrivalCoach = isInArrivalCoachWindow(arrival.utcMs, nowMs);
    const inDepartureWindow = isInDepartureNavigatorWindow(departure.utcMs, nowMs);
    // Same airport with both legs live (morning FCO→BRI + afternoon BRI→VCE) — outbound wins.
    if (inArrivalCoach && inDepartureWindow) return departure;
    if (inDepartureWindow) return departure;
    if (inArrivalCoach) return arrival;
    return null;
  }
  if (departure) return departure;
  if (arrival) return arrival;
  return null;
}

/** Coach surface for the flight the navigator is showing — depart vs arrive leg. */
export function deriveNavigatorCoachModeForFlight(
  flight: FlightReservation,
  nowMs: number = Date.now(),
): AirportDayCoachMode {
  const depMs = flightDepartureUtcMs(flight);
  const arrMs = flightArrivalUtcMs(flight);
  // G63 — in flight: surface landing airport (VCE), not origin (BRI).
  if (
    !Number.isNaN(depMs) &&
    !Number.isNaN(arrMs) &&
    nowMs >= depMs &&
    nowMs < arrMs
  ) {
    return "arrive";
  }
  if (
    !Number.isNaN(arrMs) &&
    isInArrivalCoachWindow(arrMs, nowMs) &&
    (Number.isNaN(depMs) || !isInDepartureNavigatorWindow(depMs, nowMs) || arrMs > depMs)
  ) {
    return "arrive";
  }
  return "depart";
}

/** Coach surface for a pinned airport — arrival IATA opens first-mile arrive copy. */
export function resolveCoachModeForPinnedAirport(
  flight: FlightReservation,
  pinnedIata: string,
  explicitMode?: "depart" | "arrive" | null,
  journeyCoachMode: AirportDayCoachMode = "depart",
): AirportDayCoachMode {
  if (explicitMode === "arrive") return "arrive";
  if (explicitMode === "depart") return "depart";
  const code = pinnedIata.trim().toUpperCase();
  const dep = flight.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const arr = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
  if (arr === code && dep !== code) return "arrive";
  return journeyCoachMode;
}

/**
 * Self-fetching active flight for surfaces without reservation props
 * (e.g. the Map page). Fetches once, re-selects every 30s.
 */
export function useActiveFlight(options?: UseActiveFlightOptions): {
  activeFlight: ActiveFlight | null;
  previewFlight: ActiveFlight | null;
  /** Prefer just-landed flight for Airport Mode / navigator when journeyPhase says so. */
  navigatorFlight: ActiveFlight | null;
  journeyPhase: JourneyPhase;
  coachMode: AirportDayCoachMode;
  /** Coach mode after URL / IATA pin (arrival vs departure surface). */
  navigatorCoachMode: AirportDayCoachMode;
  hotelLabel: string | null;
  travelDayFlight: TravelDayFlightPick<FlightReservation> | null;
  travelDayFlightLabel: string | null;
  reservations: FlightReservation[];
  loading: boolean;
} {
  const tripId = options?.tripId?.trim() ?? null;
  const preferredIata = options?.preferredIata?.trim().toUpperCase() ?? null;
  const preferredMode = options?.preferredMode ?? null;
  const [reservations, setReservations] = useState<FlightReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/trips", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TripsResponse) => {
        if (cancelled) return;
        const scopedTrips =
          tripId != null
            ? (data.trips ?? []).filter((trip) => trip.id === tripId)
            : (data.trips ?? []);
        const flat = scopedTrips
          .flatMap((trip) => trip.reservations ?? [])
          .filter((r) => r && typeof r === "object" && !isPlaceholderReservation(r));
        setReservations(flat);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeFlight = useMemo(() => selectActiveFlight(reservations, nowMs), [reservations, nowMs]);
  const previewFlight = useMemo(() => selectPreviewAirportFlight(reservations, nowMs), [reservations, nowMs]);
  const journeyPhase = useMemo(
    () => computeJourneyPhase({ reservations, nowMs }),
    [reservations, nowMs],
  );
  const coachMode = deriveAirportDayCoachMode(journeyPhase);
  const pinnedFlight = useMemo(
    () =>
      preferredIata
        ? selectFlightForAirportIata(reservations, preferredIata, nowMs, preferredMode)
        : null,
    [preferredIata, preferredMode, reservations, nowMs],
  );

  const navigatorFlight = useMemo(
    () =>
      selectNavigatorFlight(reservations, nowMs, journeyPhase, {
        preferredIata,
        preferredMode,
      }),
    [journeyPhase, preferredIata, preferredMode, reservations, nowMs],
  );

  const navigatorCoachMode = useMemo(() => {
    if (preferredMode === "arrive") return "arrive";
    if (preferredMode === "depart") return "depart";
    if (navigatorFlight) {
      return deriveNavigatorCoachModeForFlight(navigatorFlight.f, nowMs);
    }
    if (pinnedFlight && preferredIata) {
      return resolveCoachModeForPinnedAirport(
        pinnedFlight.f,
        preferredIata,
        preferredMode,
        coachMode,
      );
    }
    return coachMode;
  }, [navigatorFlight, pinnedFlight, preferredIata, preferredMode, coachMode, nowMs]);

  const hotelLabel = useMemo(() => {
    // Arrive / inbound coach only — never feed the first trip hotel into a depart surface.
    if (journeyPhase.kind !== "just-landed" && journeyPhase.kind !== "airborne") return null;
    const f =
      journeyPhase.kind === "airborne"
        ? (journeyPhase.onFlight as FlightReservation)
        : (journeyPhase.flight as FlightReservation);
    const dateKey =
      f.flightDate?.slice(0, 10) ??
      f.flightArrivalTime?.slice(0, 10) ??
      f.localTime?.slice(0, 10) ??
      null;
    const hotels = reservations.filter((r) => r.type === "hotel");
    return resolveArrivalHotelLabel(hotels, dateKey);
  }, [reservations, journeyPhase]);

  const travelDayFlight = useMemo(
    () => selectTravelDayDepartureFlight(reservations, nowMs),
    [reservations, nowMs],
  );
  const travelDayFlightLabel = useMemo(
    () => (travelDayFlight ? formatTravelDayFlightLabel(travelDayFlight.f) : null),
    [travelDayFlight],
  );

  return {
    activeFlight,
    previewFlight,
    navigatorFlight,
    journeyPhase,
    coachMode,
    navigatorCoachMode,
    hotelLabel,
    travelDayFlight,
    travelDayFlightLabel,
    reservations,
    loading,
  };
}

export interface NavigatorCredentials {
  tsaPreCheck: boolean;
  clear: boolean;
  known: boolean;
}

/**
 * PreCheck/CLEAR credentials backed by the travel profile — same persistence
 * shape AirportMode uses, so the question is truly asked once across surfaces.
 */
export function useNavigatorCredentials(): {
  credentials: NavigatorCredentials;
  profile: TravelProfile | null;
  saveCredentials: (answer: { tsaPreCheck: boolean; clear: boolean }) => void;
} {
  const [profile, setProfile] = useState<TravelProfile | null>(null);

  useEffect(() => {
    void fetch("/api/travel-profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { profile?: TravelProfile }) => setProfile(data.profile ?? null))
      .catch(() => null);
  }, []);

  const credentials: NavigatorCredentials = useMemo(
    () => ({
      tsaPreCheck: Boolean(profile?.tsa_precheck || profile?.global_entry),
      clear: Boolean(profile?.clear),
      known: Boolean(
        profile && (typeof profile.tsa_precheck === "boolean" || typeof profile.clear === "boolean"),
      ),
    }),
    [profile],
  );

  const saveCredentials = useCallback(
    (answer: { tsaPreCheck: boolean; clear: boolean }) => {
      setProfile((previous) => {
        const updated: TravelProfile = {
          ...(previous ?? { airlineStatuses: [] }),
          airlineStatuses: previous?.airlineStatuses ?? [],
          tsa_precheck: answer.tsaPreCheck,
          clear: answer.clear,
        };
        void fetch("/api/travel-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }).catch(() => null);
        return updated;
      });
    },
    [],
  );

  return { credentials, profile, saveCredentials };
}

/** Lounge names this traveler can access at an airport via status or card wallet. */
export function deriveEligibleLounges(
  profile: TravelProfile | null,
  airlineHint: string,
  iata: string,
): string[] {
  if (!iata) return [];
  const names = new Set<string>();

  const status = matchAirlineStatusForFlight(profile, airlineHint);
  if (status) {
    const program = findProgram(status.airline) ?? findProgram(airlineHint);
    const tier = program ? findTier(program, status.tier) : null;
    if (tier?.loungeAccess && program) {
      for (const lounge of getLoungesForAirport(program, iata)) names.add(lounge.name);
    }
  }

  if (profile?.paymentCards?.length) {
    const credentials = {
      tsaPreCheck: Boolean(profile.tsa_precheck || profile.global_entry),
      globalEntry: Boolean(profile.global_entry),
      clear: Boolean(profile.clear),
      paymentCards: profile.paymentCards,
    };
    const rules = listLoungesForAirport(iata);
    for (const entry of evaluateLoungeEligibility(iata, credentials, airlineHint)) {
      if (!entry.eligible) continue;
      const rule = rules.find((r) => r.loungeId === entry.loungeId);
      names.add(rule?.name ?? entry.loungeId);
    }
  }

  return [...names];
}
