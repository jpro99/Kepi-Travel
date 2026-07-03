import type { AwardOffer, CabinClass, LoyaltyProgram } from "./types";
import { SURCHARGE_HEAVY } from "./cppValuations";

const SEATS_AERO_BASE = "https://seats.aero/partnerapi";
const TIMEOUT_MS = 4_000; // 4s max — Duffel is the primary source, SeatsAero is bonus

interface SeatsAeroSearchInput {
  origin: string;
  destination: string;
  departDate: string;
  cabin: CabinClass;
}

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
  britishairways: "avios_ba",
  iberia: "avios_iberia",
};

const CABIN_FIELD: Record<CabinClass, string> = {
  economy: "Y",
  premium_economy: "W",
  business: "J",
  first: "F",
};

export function isSeatsAeroConfigured(): boolean {
  return Boolean(process.env.SEATS_AERO_API_KEY?.trim());
}

export async function searchAwardAvailability(input: SeatsAeroSearchInput): Promise<AwardOffer[]> {
  if (!isSeatsAeroConfigured()) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SEATS_AERO_BASE}/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "Partner-Authorization": process.env.SEATS_AERO_API_KEY as string,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return [];
    }
    payload = await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  return normalizeAvailability(payload, input.cabin);
}

function normalizeAvailability(payload: unknown, cabin: CabinClass): AwardOffer[] {
  const records = extractRecords(payload);
  const wantedCabin = CABIN_FIELD[cabin];
  const offers: AwardOffer[] = [];

  for (const record of records) {
    try {
      const sourceRaw = String(record.Source ?? record.source ?? "").toLowerCase();
      const program = SOURCE_TO_PROGRAM[sourceRaw];
      if (!program) continue;

      const availableFlag = record[`${wantedCabin}Available`] ?? record[`${wantedCabin}available`];
      if (availableFlag === false) continue;

      const milesRaw = record[`${wantedCabin}MileageCost`] ?? record[`${wantedCabin}MileageCostRaw`];
      const milesCost = toNumber(milesRaw);
      if (!milesCost || milesCost <= 0) continue;

      const taxesRaw = record[`${wantedCabin}TotalTaxes`] ?? record[`${wantedCabin}TaxesCents`] ?? 0;
      const cashSurcharge = normalizeTaxesToCents(taxesRaw);

      const origin = String(record.OriginAirport ?? record.Route?.OriginAirport ?? "");
      const destination = String(record.DestinationAirport ?? record.Route?.DestinationAirport ?? "");
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
      continue;
    }
  }

  return offers;
}

function extractRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
    if (Array.isArray(obj.results)) return obj.results as Array<Record<string, unknown>>;
  }
  return [];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTaxesToCents(value: unknown): number {
  const num = toNumber(value);
  if (num === 0) return 0;
  if (Number.isInteger(num) && num >= 1000) return num;
  return Math.round(num * 100);
}

function makeAwardId(
  program: string,
  origin: string,
  destination: string,
  date: string,
  miles: number,
): string {
  return `award_${program}_${origin}_${destination}_${date}_${miles}`.replace(/\s+/g, "");
}
