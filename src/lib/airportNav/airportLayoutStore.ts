import { logger } from "@/lib/logger";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import {
  createNextAirportLayoutPackage,
  parseAirportLayoutPackage,
  type AirportLayoutPackage,
  type AirportLayoutPackageSource,
} from "@/lib/airportNav/airportLayoutPackage";
import type { AirportLayout } from "@/lib/airportNav/types";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const AIRPORT_LAYOUT_NAMESPACE = "__global_airport_layouts__";
const AIRPORT_LAYOUT_KEY_PREFIX = "airport-layout-package:v1:";

function normalizeIata(iata: string): string {
  return iata.trim().toUpperCase();
}

function packageKey(iata: string, status: "draft" | "published"): string {
  return `${AIRPORT_LAYOUT_KEY_PREFIX}${normalizeIata(iata)}:${status}`;
}

function bundledSource(iata: string): AirportLayoutPackageSource {
  return {
    ownership: "kepi_original",
    attribution: `Kepi original ${iata} terminal schematic (approximate, not survey-grade)`,
    sourceUrls: iata === "SEA"
      ? ["https://www.portseattle.org/sea/maps"]
      : [],
    licenseNote: "Kepi-owned vector geometry informed by public operational references; official map artwork is not redistributed.",
    lastVerifiedAt: "2026-07-13",
  };
}

export async function getStoredAirportLayoutPackage(
  iata: string,
  status: "draft" | "published" = "published",
): Promise<AirportLayoutPackage | null> {
  const code = normalizeIata(iata);
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const raw = await kvStoreGet<unknown>(packageKey(code, status), { userId: AIRPORT_LAYOUT_NAMESPACE });
  if (!raw) return null;
  try {
    return parseAirportLayoutPackage(raw);
  } catch (error) {
    logger.error("Stored airport layout package failed validation.", {
      scope: "airportNav/airportLayoutStore",
      iata: code,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function saveAirportLayoutPackage(
  layout: AirportLayout,
  source: AirportLayoutPackageSource,
  options?: { status?: "draft" | "published"; now?: Date },
): Promise<AirportLayoutPackage> {
  const code = normalizeIata(layout.iata);
  const status = options?.status ?? "published";
  const [published, draft] = await Promise.all([
    getStoredAirportLayoutPackage(code, "published"),
    getStoredAirportLayoutPackage(code, "draft"),
  ]);
  const nextPackage = createNextAirportLayoutPackage({
    layout: { ...layout, iata: code },
    source,
    status,
    existingPublished: published,
    existingDraft: draft,
    now: options?.now,
  });
  await kvStoreSet(packageKey(code, status), nextPackage, { userId: AIRPORT_LAYOUT_NAMESPACE });
  return nextPackage;
}

export async function resolvePublishedAirportLayout(inputIata: string): Promise<{
  layout: AirportLayout | null;
  package: AirportLayoutPackage | null;
  source: "database" | "bundled" | "none";
}> {
  const iata = normalizeIata(inputIata);
  const stored = await getStoredAirportLayoutPackage(iata, "published");
  if (stored) {
    return { layout: stored.layout, package: stored, source: "database" };
  }

  const bundled = getAirportLayout(iata);
  if (!bundled) return { layout: null, package: null, source: "none" };

  const draft = await getStoredAirportLayoutPackage(iata, "draft");
  if (draft) {
    return { layout: bundled, package: null, source: "bundled" };
  }

  const seeded = await saveAirportLayoutPackage(bundled, bundledSource(iata), {
    status: "published",
  });
  return { layout: seeded.layout, package: seeded, source: "bundled" };
}
