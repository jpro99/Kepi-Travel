"use client";

import { useEffect, useRef, useState } from "react";
import type { FlightReservation } from "@/lib/travelAssistant/useActiveFlight";
import {
  nearestUpcomingFlightDepartureUtcMs,
  resolveFlightStatusPollIntervalMs,
  shouldPollFlightStatus,
  type FlightStatusPollProximity,
} from "@/lib/travelAssistant/flightStatusCadence";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";

export type LiveFlightStatusSnapshot = {
  departureGate: string | null;
  departureTerminal: string | null;
  flightStatus: string | null;
  delayMinutes: number | null;
  onTime: boolean | null;
  checkedAt: string;
};

function flightLookupParams(
  flight: FlightReservation,
): { flightNumber: string; airline: string; flightDate: string } | null {
  const flightNumber = (flight.flightNumber ?? "")
    .replace(/[^A-Za-z0-9]/gu, "")
    .toUpperCase();
  const airline = (flight.flightAirline ?? flight.provider ?? "").trim();
  const flightDate =
    flight.flightDepartureTime?.trim().slice(0, 10) ??
    flight.localTime?.trim().slice(0, 10) ??
    flight.flightDate?.trim().slice(0, 10) ??
    "";
  if (!flightNumber || !airline || !flightDate) return null;
  return { flightNumber, airline, flightDate };
}

async function fetchLiveFlightStatus(
  flight: FlightReservation,
): Promise<LiveFlightStatusSnapshot | null> {
  const lookup = flightLookupParams(flight);
  if (!lookup) return null;
  const params = new URLSearchParams({
    action: "flight-lookup",
    flightNumber: lookup.flightNumber,
    airline: lookup.airline,
    flightDate: lookup.flightDate,
  });
  const response = await fetch(`/api/travel-updates?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    error?: string;
    departureGate?: string;
    departureTerminal?: string;
    flightStatus?: string;
    delayMinutes?: number | null;
    onTime?: boolean | null;
  };
  if (!response.ok || payload.error) return null;
  return {
    departureGate: payload.departureGate?.trim() || null,
    departureTerminal: payload.departureTerminal?.trim() || null,
    flightStatus: payload.flightStatus?.trim() || null,
    delayMinutes:
      typeof payload.delayMinutes === "number" ? payload.delayMinutes : null,
    onTime: typeof payload.onTime === "boolean" ? payload.onTime : null,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Fast gate/status polling when the traveler is geofenced at the airport.
 * Used by Live Map airport mode (travel-assistant page has its own richer merge).
 */
export function useAtAirportFlightStatusPoll(input: {
  flight: FlightReservation | null;
  proximity: FlightStatusPollProximity;
  enabled?: boolean;
}): LiveFlightStatusSnapshot | null {
  const { flight, proximity, enabled = true } = input;
  const [snapshot, setSnapshot] = useState<LiveFlightStatusSnapshot | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !flight) {
      setSnapshot(null);
      return;
    }
    const depMs = flightDepartureUtcMs(flight);
    if (!shouldPollFlightStatus(depMs)) {
      setSnapshot(null);
      return;
    }
    const atAirport =
      proximity === "at-airport" || proximity === "in-terminal";
    if (!atAirport) {
      setSnapshot(null);
      return;
    }

    const pollIntervalMs = resolveFlightStatusPollIntervalMs(depMs, Date.now(), proximity);

    const poll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const next = await fetchLiveFlightStatus(flight);
        if (next) setSnapshot(next);
      } catch {
        /* retry on next tick */
      } finally {
        inFlightRef.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [enabled, flight, proximity]);

  return snapshot;
}

export function nearestPollableFlightDepartureUtcMs(
  flights: ReadonlyArray<FlightReservation>,
  nowMs = Date.now(),
): number | null {
  return nearestUpcomingFlightDepartureUtcMs(flights, nowMs);
}
