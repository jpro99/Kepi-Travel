import { z } from "zod";
import type { FlightStatusSnapshot } from "@/lib/travelAssistant/flightStatusSnapshot";

const AERODATABOX_BASE = "https://prod.api.market/api/v1/aedbx/aerodatabox";
const TIMEOUT_MS = 12_000;

const AeroFlightSchema = z.object({
  number: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  departure: z
    .object({
      airport: z.object({ iata: z.string().optional().nullable() }).optional().nullable(),
      scheduledTimeLocal: z.string().optional().nullable(),
      gate: z.string().optional().nullable(),
      terminal: z.string().optional().nullable(),
      delay: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
  arrival: z
    .object({
      airport: z.object({ iata: z.string().optional().nullable() }).optional().nullable(),
      /** Baggage belt(s) for arriving flights when AeroDataBox has them. */
      baggageBelt: z.string().optional().nullable(),
      terminal: z.string().optional().nullable(),
      gate: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export function resolveAeroDataBoxApiKey(): string | null {
  return (
    process.env.AERODATABOX_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_AERODATABOX_API_KEY?.trim() ||
    null
  );
}

function pickBestFlight(
  flights: z.infer<typeof AeroFlightSchema>[],
  nowMs: number,
): z.infer<typeof AeroFlightSchema> | null {
  if (flights.length === 0) return null;
  return (
    flights
      .filter((flight) => flight.departure?.scheduledTimeLocal)
      .sort((left, right) => {
        const leftMs = Date.parse(left.departure?.scheduledTimeLocal ?? "") || 0;
        const rightMs = Date.parse(right.departure?.scheduledTimeLocal ?? "") || 0;
        return Math.abs(leftMs - nowMs) - Math.abs(rightMs - nowMs);
      })[0] ?? flights[0] ??
    null
  );
}

export async function fetchAeroDataBoxFlightSnapshot(input: {
  flightNumber: string;
  flightDate: string;
  apiKey?: string;
  nowMs?: number;
}): Promise<FlightStatusSnapshot | null> {
  const apiKey = input.apiKey ?? resolveAeroDataBoxApiKey();
  if (!apiKey) return null;

  const flightNum = input.flightNumber.replace(/\s+/gu, "").toUpperCase();
  const url = `${AERODATABOX_BASE}/flights/number/${encodeURIComponent(flightNum)}/${encodeURIComponent(input.flightDate)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "x-api-market-key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = z.array(AeroFlightSchema).safeParse(Array.isArray(raw) ? raw : [raw]);
    if (!parsed.success || parsed.data.length === 0) return null;
    const best = pickBestFlight(parsed.data, input.nowMs ?? Date.now());
    if (!best) return null;
    const depDelay =
      typeof best.departure?.delay === "number" && Number.isFinite(best.departure.delay)
        ? Math.max(0, Math.round(best.departure.delay))
        : null;
    return {
      source: "aerodatabox",
      fetchedAtMs: input.nowMs ?? Date.now(),
      flightNumber: best.number ?? flightNum,
      flightDate: input.flightDate,
      status: (best.status ?? "unknown").toLowerCase(),
      delayMinutes: depDelay,
      departureGate: (best.departure?.gate ?? "").trim(),
      departureTerminal: (best.departure?.terminal ?? "").trim(),
      departureAirport: (best.departure?.airport?.iata ?? "").trim().toUpperCase(),
      arrivalAirport: (best.arrival?.airport?.iata ?? "").trim().toUpperCase(),
      baggageClaim: (best.arrival?.baggageBelt ?? "").trim(),
      authorityRank: 2,
    };
  } finally {
    clearTimeout(timeout);
  }
}
