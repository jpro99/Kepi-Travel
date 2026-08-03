import type { FlightStatusSnapshot } from "@/lib/travelAssistant/flightStatusSnapshot";

const FLIGHTAWARE_BASE = "https://aeroapi.flightaware.com/aeroapi";
const TIMEOUT_MS = 12_000;

export function resolveFlightAwareApiKey(): string | null {
  return process.env.FLIGHTAWARE_AEROAPI_KEY?.trim() || null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAirportCode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as Record<string, unknown>;
  return (readString(record.code_iata) || readString(record.code)).toUpperCase();
}

function readDelayMinutes(flight: Record<string, unknown>): number | null {
  const departureDelay = flight.departure_delay;
  if (typeof departureDelay === "number" && Number.isFinite(departureDelay)) {
    return Math.max(0, Math.round(departureDelay / 60));
  }
  return null;
}

export async function fetchFlightAwareFlightSnapshot(input: {
  flightNumber: string;
  flightDate: string;
  apiKey?: string;
  nowMs?: number;
}): Promise<FlightStatusSnapshot | null> {
  const apiKey = input.apiKey ?? resolveFlightAwareApiKey();
  if (!apiKey) return null;

  const ident = input.flightNumber.replace(/\s+/gu, "").toUpperCase();
  const start = `${input.flightDate}T00:00:00Z`;
  const end = `${input.flightDate}T23:59:59Z`;
  const url = `${FLIGHTAWARE_BASE}/flights/${encodeURIComponent(ident)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { flights?: Record<string, unknown>[] };
    const flights = Array.isArray(payload.flights) ? payload.flights : [];
    if (flights.length === 0) return null;
    const best = flights[0] as Record<string, unknown>;
    return {
      source: "flightaware",
      fetchedAtMs: input.nowMs ?? Date.now(),
      flightNumber: readString(best.ident_iata) || ident,
      flightDate: input.flightDate,
      status: readString(best.status).toLowerCase() || "unknown",
      delayMinutes: readDelayMinutes(best),
      departureGate: readString(best.gate_origin),
      departureTerminal: readString(best.terminal_origin),
      departureAirport: readAirportCode(best.origin),
      arrivalAirport: readAirportCode(best.destination),
      // AeroAPI field: baggage_claim (nullable string at destination).
      baggageClaim: readString(best.baggage_claim),
      authorityRank: 3,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
