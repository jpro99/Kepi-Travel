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
import { timezoneForIata } from "@/lib/airports/lookup";
import { computeJourneyPhase, type JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { resolveArrivalHotelLabel } from "@/lib/travelAssistant/airportSpotlightContext";
import {
  flightDepartureUtcMs,
  formatTravelDayFlightLabel,
  selectNextRemainingFlight,
  selectTravelDayDepartureFlight,
  type TravelDayFlightPick,
} from "@/lib/travelAssistant/flightSort";
import {
  selectActiveArrivalFlight,
  selectRemainingJourneyFlight,
} from "@/lib/travelAssistant/remainingJourneyFlight";
import { canonicalFlightDepartureLocalTime } from "@/lib/travelAssistant/tripWindow";

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

/** Live airport mode: departure within −60min … +180min (day-of navigation). */
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
      .map((f) => ({ f, utcMs: flightDepartureUtcMs(f) }))
      .filter(
        ({ utcMs }) =>
          !isNaN(utcMs) &&
          (utcMs - nowMs) / 60_000 < ahead &&
          (nowMs - utcMs) / 60_000 < behind,
      )
      .sort((a, b) => a.utcMs - b.utcMs)[0] ?? null
  );
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

function flightArrivalUtcMs(f: FlightReservation): number {
  const arrivalLocal =
    f.flightArrivalTime?.trim() ||
    canonicalFlightDepartureLocalTime(f);
  return toUtcMs(arrivalLocal, f.timezone);
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
  const candidates = reservations
    .filter(
      (r) =>
        r.type === "flight" &&
        r.flightDepartureAirport?.trim().toUpperCase() === code,
    )
    .map((f) => ({ f, utcMs: flightDepartureUtcMs(f) }))
    .filter(({ utcMs }) => !isNaN(utcMs))
    .sort((a, b) => a.utcMs - b.utcMs);
  const upcoming =
    candidates.find(({ utcMs }) => utcMs >= nowMs - graceMs) ?? candidates[0] ?? null;
  return upcoming;
}

/** Pick the best flight for a pinned arrival airport (FCO first-mile, etc.). */
export function selectFlightForArrivalIata(
  reservations: FlightReservation[],
  iata: string,
  nowMs: number,
): ActiveFlight | null {
  const code = iata.trim().toUpperCase();
  if (!code) return null;
  const graceMs = WINDOW_BEHIND_MIN * 60_000;
  const candidates = reservations
    .filter(
      (r) =>
        r.type === "flight" &&
        r.flightArrivalAirport?.trim().toUpperCase() === code,
    )
    .map((f) => ({ f, utcMs: flightArrivalUtcMs(f) }))
    .filter(({ utcMs }) => !isNaN(utcMs))
    .sort((a, b) => a.utcMs - b.utcMs);
  const upcoming =
    candidates.find(({ utcMs }) => utcMs >= nowMs - graceMs) ?? candidates[0] ?? null;
  return upcoming;
}

/** Match a pinned IATA to the correct leg — arrival when mode=arrive or when arrival is next at this airport. */
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
  if (arrival && !departure) return arrival;
  if (departure && !arrival) return departure;
  if (!arrival || !departure) return null;
  // FCO (and any hub with both inbound + outbound): pick the chronologically next
  // event at this airport so AZ1607 FCO→BRI cannot steal AS180 SEA→FCO preview.
  return arrival.utcMs <= departure.utcMs ? arrival : departure;
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

  const remainingJourneyFlight = useMemo(
    () => selectRemainingJourneyFlight(reservations, nowMs),
    [reservations, nowMs],
  );

  const navigatorFlight = useMemo(() => {
    const arrivalRemaining = selectActiveArrivalFlight(reservations, nowMs);
    if (arrivalRemaining && !pinnedFlight) {
      const arrivalTz =
        timezoneForIata(arrivalRemaining.flightArrivalAirport ?? "") ?? arrivalRemaining.timezone;
      const utcMs = toUtcMs(arrivalRemaining.flightArrivalTime ?? arrivalRemaining.localTime, arrivalTz);
      return { f: arrivalRemaining, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
    }
    if (journeyPhase.kind === "just-landed" && !pinnedFlight) {
      const f = journeyPhase.flight as FlightReservation;
      const arrivalTz =
        timezoneForIata(f.flightArrivalAirport ?? "") ?? f.timezone;
      const utcMs = toUtcMs(f.flightArrivalTime ?? f.localTime, arrivalTz);
      return { f, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
    }
    if (pinnedFlight) return pinnedFlight;
    if (remainingJourneyFlight) {
      const utcMs = flightDepartureUtcMs(remainingJourneyFlight);
      return { f: remainingJourneyFlight, utcMs: Number.isNaN(utcMs) ? nowMs : utcMs };
    }
    return activeFlight ?? previewFlight;
  }, [
    journeyPhase,
    pinnedFlight,
    activeFlight,
    previewFlight,
    remainingJourneyFlight,
    reservations,
    nowMs,
  ]);

  const navigatorCoachMode = useMemo(() => {
    if (pinnedFlight && preferredIata) {
      const resolved = resolveCoachModeForPinnedAirport(
        pinnedFlight.f,
        preferredIata,
        preferredMode,
        coachMode,
      );
      if (resolved === "arrive" || resolved === "depart") return resolved;
      // Pinned flight is the arrival leg at this IATA — open first-mile arrive surface.
      const code = preferredIata.trim().toUpperCase();
      const dep = pinnedFlight.f.flightDepartureAirport?.trim().toUpperCase() ?? "";
      const arr = pinnedFlight.f.flightArrivalAirport?.trim().toUpperCase() ?? "";
      if (arr === code && dep !== code) return "arrive";
      return coachMode;
    }
    return coachMode;
  }, [pinnedFlight, preferredIata, preferredMode, coachMode]);

  const hotelLabel = useMemo(() => {
    // Arrive coach only — never feed the first trip hotel (e.g. Polignano) into
    // a depart surface at ONT as an Uber dropoff.
    if (journeyPhase.kind !== "just-landed") return null;
    const f = journeyPhase.flight as FlightReservation;
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
