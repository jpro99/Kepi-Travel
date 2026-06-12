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

/** Local "YYYY-MM-DD HH:MM" + IANA timezone → UTC ms (Intl offset method). */
export function toUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const approxUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!timezone) return approxUtc;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(approxUtc)).map((p) => [p.type, p.value]));
    const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return approxUtc - (asIfUtc - approxUtc);
  } catch {
    return approxUtc;
  }
}

const WINDOW_AHEAD_MIN = 180;
const WINDOW_BEHIND_MIN = 60;

/** Same selection AirportMode has always used: next flight in the airport window. */
export function selectActiveFlight(
  reservations: FlightReservation[],
  nowMs: number,
): ActiveFlight | null {
  return (
    reservations
      .filter((r) => r.type === "flight")
      .map((f) => ({ f, utcMs: toUtcMs(f.localTime, f.timezone) }))
      .filter(
        ({ utcMs }) =>
          !isNaN(utcMs) &&
          (utcMs - nowMs) / 60_000 < WINDOW_AHEAD_MIN &&
          (nowMs - utcMs) / 60_000 < WINDOW_BEHIND_MIN,
      )
      .sort((a, b) => a.utcMs - b.utcMs)[0] ?? null
  );
}

/** Mirrors page.tsx's onboarding-placeholder rule (provider/notes markers). */
function isPlaceholderReservation(r: FlightReservation): boolean {
  const provider = (r.provider ?? "").trim().toLowerCase();
  const notes = (r.notes ?? "").trim().toLowerCase();
  return provider === "onboarding setup" || notes.includes("created during onboarding");
}

interface TripsResponse {
  trips?: { reservations?: FlightReservation[] }[];
}

/**
 * Self-fetching active flight for surfaces without reservation props
 * (e.g. the Map page). Fetches once, re-selects every 30s.
 */
export function useActiveFlight(): { activeFlight: ActiveFlight | null; loading: boolean } {
  const [reservations, setReservations] = useState<FlightReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/trips", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TripsResponse) => {
        if (cancelled) return;
        const flat = (data.trips ?? [])
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
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeFlight = useMemo(() => selectActiveFlight(reservations, nowMs), [reservations, nowMs]);
  return { activeFlight, loading };
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

/** Lounge names this traveler can access at an airport via airline status. */
export function deriveEligibleLounges(
  profile: TravelProfile | null,
  airlineHint: string,
  iata: string,
): string[] {
  const status = profile?.airlineStatuses?.[0];
  if (!status || !iata) return [];
  const program = findProgram(status.airline) ?? findProgram(airlineHint);
  if (!program) return [];
  const tier = findTier(program, status.tier);
  if (!tier?.loungeAccess) return [];
  return getLoungesForAirport(program, iata).map((lounge) => lounge.name);
}
