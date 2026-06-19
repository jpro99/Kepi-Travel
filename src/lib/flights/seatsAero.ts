import { buildSeatsAeroSearchUrl } from "@/lib/decision/awardFlexEstimate";
import { logger } from "@/lib/logger";
import type { AwardOffer, FlightCabin } from "@/lib/flights/types";
import type { ReachableProgram } from "@/lib/flights/transferPartners";

const SEATS_AERO_BASE = "https://seats.aero/partnerapi";
const TIMEOUT_MS = 18_000;

function resolveSeatsAeroKey(): string | null {
  return process.env.SEATS_AERO_API_KEY?.trim() || null;
}

const CABIN_FIELDS: Record<
  FlightCabin,
  { available: string; miles: string; airlines: string; direct: string; seats: string }
> = {
  economy: {
    available: "YAvailable",
    miles: "YMileageCost",
    airlines: "YAirlines",
    direct: "YDirect",
    seats: "YRemainingSeats",
  },
  premium_economy: {
    available: "WAvailable",
    miles: "WMileageCost",
    airlines: "WAirlines",
    direct: "WDirect",
    seats: "WRemainingSeats",
  },
  business: {
    available: "JAvailable",
    miles: "JMileageCost",
    airlines: "JAirlines",
    direct: "JDirect",
    seats: "JRemainingSeats",
  },
  first: {
    available: "FAvailable",
    miles: "FMileageCost",
    airlines: "FAirlines",
    direct: "FDirect",
    seats: "FRemainingSeats",
  },
};

function readBool(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  return value === true;
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function readInt(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function programLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function normalizeAvailability(
  row: Record<string, unknown>,
  cabin: FlightCabin,
  funded?: ReachableProgram,
): AwardOffer | null {
  const fields = CABIN_FIELDS[cabin];
  if (!readBool(row, fields.available)) return null;

  const miles = readInt(row, fields.miles);
  if (miles <= 0) return null;

  const route = row.Route;
  if (!route || typeof route !== "object") return null;
  const routeRow = route as Record<string, unknown>;
  const origin = readString(routeRow, "OriginAirport").toUpperCase();
  const destination = readString(routeRow, "DestinationAirport").toUpperCase();
  if (!origin || !destination) return null;

  const programSlug = readString(row, "Source").toLowerCase() || readString(routeRow, "Source").toLowerCase();
  if (!programSlug) return null;

  const departureDate = readString(row, "Date");
  const id = readString(row, "ID") || `${programSlug}-${origin}-${destination}-${departureDate}-${cabin}`;

  return {
    id,
    origin,
    destination,
    departureDate,
    program: programLabel(programSlug),
    programSlug,
    miles,
    taxesUsd: 5.6,
    cabin,
    airlines: readString(row, fields.airlines),
    direct: readBool(row, fields.direct),
    remainingSeats: readInt(row, fields.seats),
    availabilityId: id,
    verifyUrl: buildSeatsAeroSearchUrl({ origin, destination, departureDate }),
    source: "seats_aero",
    fundedBy: funded?.fundedBy,
    transferFrom: funded?.fundedBy,
  };
}

export interface SeatsAeroSearchParams {
  origins: string[];
  destination: string;
  departureDate: string;
  cabin?: FlightCabin;
  reachablePrograms?: ReachableProgram[];
}

export async function searchSeatsAeroAwards(params: SeatsAeroSearchParams): Promise<{
  configured: boolean;
  offers: AwardOffer[];
}> {
  const apiKey = resolveSeatsAeroKey();
  if (!apiKey) {
    return { configured: false, offers: [] };
  }

  const cabin = params.cabin ?? "economy";
  const origins = params.origins.map((o) => o.toUpperCase()).join(",");
  const destination = params.destination.toUpperCase();
  const sourceFilter = params.reachablePrograms?.map((p) => p.slug).join(",") ?? "";

  const query = new URLSearchParams({
    origin_airport: origins,
    destination_airport: destination,
    start_date: params.departureDate,
    end_date: params.departureDate,
    take: "100",
    order_by: "lowest_mileage",
  });
  if (sourceFilter) query.set("sources", sourceFilter);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${SEATS_AERO_BASE}/search?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Partner-Authorization": apiKey,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn("Seats.aero search failed", {
        scope: "flights/seatsAero",
        status: response.status,
        body: text.slice(0, 200),
      });
      return { configured: true, offers: [] };
    }

    const payload = (await response.json()) as { data?: unknown[] };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const reachable = params.reachablePrograms ?? [];
    const fundedBySlug = new Map(reachable.map((p) => [p.slug, p]));

    const offers: AwardOffer[] = [];
    for (const item of rows) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const slug = readString(row, "Source").toLowerCase();
      const offer = normalizeAvailability(row, cabin, fundedBySlug.get(slug));
      if (offer) offers.push(offer);
    }

    offers.sort((a, b) => a.miles - b.miles);
    return { configured: true, offers };
  } catch (error) {
    logger.warn("Seats.aero search error", {
      scope: "flights/seatsAero",
      error: error instanceof Error ? error.message : "unknown",
    });
    return { configured: true, offers: [] };
  } finally {
    clearTimeout(timer);
  }
}

export function isSeatsAeroConfigured(): boolean {
  return Boolean(resolveSeatsAeroKey());
}
