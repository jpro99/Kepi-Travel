// src/lib/flights/seatsAero.ts
// Award availability client (Seats.aero Partner API). This is the single
// addition that moves Kepi from "booking engine" to "deal engine" on the points
// side — none of your direct competitors fuse this with a live cash booker.
//
// IMPORTANT — VERIFY BEFORE SHIP:
// Seats.aero's Partner API field names and auth header have changed over time.
// Before pushing, confirm against current docs (https://seats.aero/api) that:
//   - the base URL + path are correct,
//   - the auth header is "Partner-Authorization" (it has used this; some keys
//     use a Bearer token),
//   - the response fields used in normalizeAvailability() still match.
// The normalizer is written defensively with fallbacks so a field rename
// degrades to "skip that record" rather than crashing the whole search.

import type { AwardOffer, CabinClass, LoyaltyProgram } from "./types";
import { SURCHARGE_HEAVY } from "./cppValuations";

const SEATS_AERO_BASE = "https://seats.aero/partnerapi";

interface SeatsAeroSearchInput {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  cabin: CabinClass;
}

// Maps Seats.aero "source" strings to our LoyaltyProgram enum.
// Extend as you encounter more sources in live results.
const SOURCE_TO_PROGRAM: Record<string, LoyaltyProgram> = {
  united: "united",
  aeroplan: "aeroplan",
  american: "american",
  delta: "delta",
  alaska: "alaska",
  jetblue: "jetblue",
  flyingblue: "flyingblue",
  virginatlantic: "virginatlantic",
  emirates: "emirates",
  etihad: "etihad",
  qatar: "qatar_avios",
  ana: "ana",
  singapore: "singapore_krisflyer",
  lifemiles: "lifemiles",
  turkish: "turkish",
  velocity: "virginatlantic",
};

const CABIN_FIELD: Record<CabinClass, string> = {
  economy: "Y",
  premium_economy: "W",
  business: "J",
  first: "F",
};

export function isSeatsAeroConfigured(): boolean {
  return Boolean(process.env.SEATS_AERO_API_KEY);
}

export async function searchAwardAvailability(
  input: SeatsAeroSearchInput
): Promise<AwardOffer[]> {
  if (!isSeatsAeroConfigured()) {
    // Graceful degradation: no key => no award results, search still returns cash.
    return [];
  }

  const params = new URLSearchParams({
    origin_airport: input.origin,
    destination_airport: input.destination,
    start_date: input.departDate,
    end_date: input.departDate,
    take: "50",
  });

  let payload: unknown;
  try {
    const res = await fetch(`${SEATS_AERO_BASE}/search?${params.toString()}`, {
      method: "GET",
      headers: {
        // Confirm header name against current docs before ship.
        "Partner-Authorization": process.env.SEATS_AERO_API_KEY as string,
        Accept: "application/json",
      },
      // Award space is time-sensitive; do not let Next cache it.
      cache: "no-store",
    });
    if (!res.ok) {
      // Surface nothing rather than throw — keeps cash search alive.
      return [];
    }
    payload = await res.json();
  } catch {
    return [];
  }

  return normalizeAvailability(payload, input.cabin);
}

function normalizeAvailability(payload: unknown, cabin: CabinClass): AwardOffer[] {
  const records = extractRecords(payload);
  const wantedCabin = CABIN_FIELD[cabin];
  const offers: AwardOffer[] = [];

  for (const record of records) {
    try {
      const sourceRaw = String(
        record.Source ?? record.source ?? ""
      ).toLowerCase();
      const program = SOURCE_TO_PROGRAM[sourceRaw];
      if (!program) continue; // unknown source — skip rather than guess

      // Seats.aero exposes per-cabin availability flags + mileage costs.
      // Field names follow the "<cabin>Available" / "<cabin>MileageCost" shape.
      const availableFlag =
        record[`${wantedCabin}Available`] ?? record[`${wantedCabin}available`];
      if (availableFlag === false) continue;

      const milesRaw =
        record[`${wantedCabin}MileageCost`] ??
        record[`${wantedCabin}MileageCostRaw`];
      const milesCost = toNumber(milesRaw);
      if (!milesCost || milesCost <= 0) continue;

      const taxesRaw =
        record[`${wantedCabin}TotalTaxes`] ??
        record[`${wantedCabin}TaxesCents`] ??
        0;
      // Seats.aero taxes are often already in cents; if it looks like dollars
      // (small value with decimals), convert. Defensive either way.
      const cashSurcharge = normalizeTaxesToCents(taxesRaw);

      const origin = String(
        record.OriginAirport ?? record.Route?.OriginAirport ?? ""
      );
      const destination = String(
        record.DestinationAirport ?? record.Route?.DestinationAirport ?? ""
      );
      const date = String(record.Date ?? record.date ?? "");

      offers.push({
        kind: "award",
        id: makeAwardId(program, origin, destination, date, milesCost),
        program,
        milesCost,
        cashSurcharge,
        currency: "USD",
        cabin,
        surchargeHeavy: SURCHARGE_HEAVY.has(program),
        rawAvailabilityId: String(record.ID ?? record.id ?? ""),
        source: "seats_aero",
        segments: [
          {
            origin,
            destination,
            departingAt: date,
            arrivingAt: date,
            marketingCarrier: sourceRaw.toUpperCase().slice(0, 2),
            flightNumber: "—",
          },
        ],
      });
    } catch {
      // One malformed record shouldn't sink the batch.
      continue;
    }
  }

  return offers;
}

// --- defensive helpers -----------------------------------------------------

function extractRecords(payload: unknown): Array<Record<string, any>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, any>>;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, any>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTaxesToCents(value: unknown): number {
  const num = toNumber(value);
  if (num === 0) return 0;
  // Heuristic: integers >= 1000 are almost certainly already cents.
  if (Number.isInteger(num) && num >= 1000) return num;
  // Otherwise treat as dollars.
  return Math.round(num * 100);
}

// Deterministic id (no crypto.randomUUID — per your engineering rules).
function makeAwardId(
  program: string,
  origin: string,
  destination: string,
  date: string,
  miles: number
): string {
  return `award_${program}_${origin}_${destination}_${date}_${miles}`.replace(
    /\s+/g,
    ""
  );
}
