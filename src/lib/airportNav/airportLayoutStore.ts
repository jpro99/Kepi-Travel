import { logger } from "@/lib/logger";
import { setAirportCurationStatus } from "@/lib/airportNav/airportCurationQueue";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import {
  getAirportLayoutBlobJson,
  putAirportLayoutBlob,
} from "@/lib/airportNav/airportLayoutBlob";
import {
  createNextAirportLayoutPackage,
  parseAirportLayoutPackage,
  type AirportLayoutPackage,
  type AirportLayoutPackageSource,
  type AirportLayoutPrecisionGrade,
  type AirportLayoutPreviewConfirmation,
} from "@/lib/airportNav/airportLayoutPackage";
import type { AirportLayout } from "@/lib/airportNav/types";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const AIRPORT_LAYOUT_NAMESPACE = "__global_airport_layouts__";
const AIRPORT_LAYOUT_KEY_PREFIX = "airport-layout-package:v1:";
const PACKAGE_INDEX_KEY = `${AIRPORT_LAYOUT_KEY_PREFIX}index`;
const NS = { userId: AIRPORT_LAYOUT_NAMESPACE };
const SCOPE = "airportNav/airportLayoutStore";

/** Who "confirms" the visual preview for compiled seed layouts (human-reviewed in code). */
export const SEED_PREVIEW_CONFIRMER = "kepi-seed-bundle";

/**
 * What actually sits in Redis. Either the full package (layout inline —
 * legacy records and the no-Blob fallback) or metadata + layoutBlobUrl with
 * the layout payload offloaded to Vercel Blob.
 */
export type StoredAirportLayoutPackageRecord =
  Omit<AirportLayoutPackage, "layout"> & {
    layout?: AirportLayout;
    layoutBlobUrl?: string;
  };

function normalizeIata(iata: string): string {
  return iata.trim().toUpperCase();
}

function packageKey(iata: string, status: "draft" | "published"): string {
  return `${AIRPORT_LAYOUT_KEY_PREFIX}${normalizeIata(iata)}:${status}`;
}

function revisionKey(iata: string, revision: number): string {
  return `${AIRPORT_LAYOUT_KEY_PREFIX}${normalizeIata(iata)}:rev:${revision}`;
}

function revisionIndexKey(iata: string): string {
  return `${AIRPORT_LAYOUT_KEY_PREFIX}${normalizeIata(iata)}:revisions`;
}

export function bundledSource(iata: string): AirportLayoutPackageSource {
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

/** Rebuild + validate a full package from a stored record, fetching the Blob payload when offloaded. */
async function hydrateStoredPackageRecord(
  record: StoredAirportLayoutPackageRecord,
  iata: string,
): Promise<AirportLayoutPackage | null> {
  try {
    if (record.layout) {
      return parseAirportLayoutPackage(record);
    }
    if (record.layoutBlobUrl) {
      const layout = await getAirportLayoutBlobJson(record.layoutBlobUrl);
      if (!layout) {
        logger.error("Airport layout Blob payload is unavailable for stored package.", {
          scope: SCOPE,
          iata,
          revision: record.revision,
        });
        return null;
      }
      return parseAirportLayoutPackage({ ...record, layout });
    }
    logger.error("Stored airport layout record has neither inline layout nor Blob URL.", {
      scope: SCOPE,
      iata,
      revision: record.revision,
    });
    return null;
  } catch (error) {
    logger.error("Stored airport layout package failed validation.", {
      scope: SCOPE,
      iata,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function getStoredAirportLayoutPackage(
  iata: string,
  status: "draft" | "published" = "published",
): Promise<AirportLayoutPackage | null> {
  const code = normalizeIata(iata);
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const raw = await kvStoreGet<StoredAirportLayoutPackageRecord>(packageKey(code, status), NS);
  if (!raw) return null;
  return hydrateStoredPackageRecord(raw, code);
}

/** Immutable metadata history (no layout hydration — cheap for admin listing). */
export async function listAirportLayoutRevisionRecords(
  iata: string,
): Promise<StoredAirportLayoutPackageRecord[]> {
  const code = normalizeIata(iata);
  if (!/^[A-Z]{3}$/.test(code)) return [];
  const revisions = await kvStoreGet<number[]>(revisionIndexKey(code), NS) ?? [];
  const records = await Promise.all(
    revisions.map((revision) =>
      kvStoreGet<StoredAirportLayoutPackageRecord>(revisionKey(code, revision), NS),
    ),
  );
  return records
    .filter((record): record is StoredAirportLayoutPackageRecord => record !== null)
    .sort((a, b) => b.revision - a.revision);
}

/** One historical revision, fully hydrated. */
export async function getAirportLayoutPackageRevision(
  iata: string,
  revision: number,
): Promise<AirportLayoutPackage | null> {
  const code = normalizeIata(iata);
  if (!/^[A-Z]{3}$/.test(code) || !Number.isInteger(revision) || revision < 1) return null;
  const raw = await kvStoreGet<StoredAirportLayoutPackageRecord>(revisionKey(code, revision), NS);
  if (!raw) return null;
  return hydrateStoredPackageRecord(raw, code);
}

/** All airports that have at least one stored package (draft or published). */
export async function listAirportLayoutPackageIatas(): Promise<string[]> {
  return await kvStoreGet<string[]>(PACKAGE_INDEX_KEY, NS) ?? [];
}

async function appendToPackageIndex(iata: string): Promise<void> {
  const current = await kvStoreGet<string[]>(PACKAGE_INDEX_KEY, NS) ?? [];
  if (current.includes(iata)) return;
  await kvStoreSet(PACKAGE_INDEX_KEY, [iata, ...current].slice(0, 2000), NS);
}

async function appendToRevisionIndex(iata: string, revision: number): Promise<void> {
  const current = await kvStoreGet<number[]>(revisionIndexKey(iata), NS) ?? [];
  if (current.includes(revision)) return;
  await kvStoreSet(revisionIndexKey(iata), [...current, revision].sort((a, b) => a - b), NS);
}

export async function saveAirportLayoutPackage(
  layout: AirportLayout,
  source: AirportLayoutPackageSource,
  options?: {
    status?: "draft" | "published";
    now?: Date;
    precisionGrade?: AirportLayoutPrecisionGrade;
    previewConfirmation?: AirportLayoutPreviewConfirmation;
  },
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
    precisionGrade: options?.precisionGrade,
    previewConfirmation: options?.previewConfirmation,
  });

  // Offload the payload to Blob when configured; otherwise store inline (fallback).
  const layoutBlobUrl = await putAirportLayoutBlob({
    iata: code,
    revision: nextPackage.revision,
    status,
    layout: nextPackage.layout,
  });
  const finalPackage: AirportLayoutPackage = layoutBlobUrl
    ? { ...nextPackage, layoutBlobUrl }
    : nextPackage;
  let record: StoredAirportLayoutPackageRecord = finalPackage;
  if (layoutBlobUrl) {
    const { layout: _inline, ...metadata } = finalPackage;
    record = metadata;
  }

  await Promise.all([
    kvStoreSet(packageKey(code, status), record, NS),
    kvStoreSet(revisionKey(code, finalPackage.revision), record, NS),
    appendToRevisionIndex(code, finalPackage.revision),
    appendToPackageIndex(code),
    setAirportCurationStatus(code, status, {
      linkedPackageRevision: finalPackage.revision,
    }),
  ]);
  return finalPackage;
}

/**
 * True when a stored package originated from our own compiled seed bundle (not
 * an admin manual publish or an OSM import). Seed packages carry the fixed
 * attribution `bundledSource()` produces; admin/OSM-curated publishes supply a
 * different attribution, so they are never auto-replaced by the code bundle.
 */
function isSeedOriginatedPackage(pkg: AirportLayoutPackage, iata: string): boolean {
  return pkg.source.attribution === bundledSource(iata).attribution;
}

export async function resolvePublishedAirportLayout(inputIata: string): Promise<{
  layout: AirportLayout | null;
  package: AirportLayoutPackage | null;
  source: "database" | "bundled" | "none";
}> {
  const iata = normalizeIata(inputIata);
  const stored = await getStoredAirportLayoutPackage(iata, "published");
  const bundled = getAirportLayout(iata);

  if (stored) {
    // A published package our own seed path created must never pin outdated
    // geometry after we ship a corrected bundle. "Database wins" is right for
    // admin/OSM-curated packages, but a code-owned seed whose bundle now carries
    // a newer layoutVersion has to re-publish itself so live traffic gets the
    // fix without a manual admin republish (KEPI_DESIGN_LAW M25). This is exactly
    // why the SEA check-in/security fix never reached the live map: the source
    // edit changed the bundle, but Redis kept serving the old seeded revision.
    if (
      bundled &&
      isSeedOriginatedPackage(stored, iata) &&
      stored.layout.layoutVersion !== bundled.layoutVersion
    ) {
      const reseeded = await saveAirportLayoutPackage(bundled, bundledSource(iata), {
        status: "published",
        previewConfirmation: { by: SEED_PREVIEW_CONFIRMER },
      });
      return { layout: reseeded.layout, package: reseeded, source: "bundled" };
    }
    return { layout: stored.layout, package: stored, source: "database" };
  }

  if (!bundled) return { layout: null, package: null, source: "none" };

  const draft = await getStoredAirportLayoutPackage(iata, "draft");
  if (draft) {
    return { layout: bundled, package: null, source: "bundled" };
  }

  const seeded = await saveAirportLayoutPackage(bundled, bundledSource(iata), {
    status: "published",
    // Compiled seed layouts are human-reviewed in code; they self-confirm the preview gate.
    previewConfirmation: { by: SEED_PREVIEW_CONFIRMER },
  });
  return { layout: seeded.layout, package: seeded, source: "bundled" };
}
