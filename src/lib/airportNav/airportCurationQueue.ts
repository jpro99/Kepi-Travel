import { getAirportWayfindingResource } from "@/lib/airportNav/officialWayfinding";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { getStoredAirportLayoutPackage, bundledSource } from "@/lib/airportNav/airportLayoutStore";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import type { AirportLayout } from "@/lib/airportNav/types";
import {
  isLayoutStale,
  layoutStalenessStatus,
  stalenessLabel,
  type LayoutStalenessStatus,
} from "@/lib/airportNav/layoutStaleness";

/**
 * M40 follow-up (2026-08-21) — arrivals is a second, independently-tracked
 * demand dimension, not folded into the existing departure `status`. LAX had
 * departure curation for weeks before anyone could tell arrivals coverage was
 * still missing; that gap is exactly what this catches, driven by real
 * traveler/trip demand instead of picking airports speculatively.
 */
const ARRIVALS_NODE_KINDS = new Set(["customs", "baggage_claim", "ground_transport"]);

/** True once a layout has ANY arrivals-side node — existence, not verification. */
export function hasArrivalsCoverage(layout: Pick<AirportLayout, "nodes">): boolean {
  return layout.nodes.some((node) => ARRIVALS_NODE_KINDS.has(node.kind));
}

const AIRPORT_LAYOUT_NAMESPACE = "__global_airport_layouts__";
const CURATION_KEY_PREFIX = "airport-curation:v1:";
const CURATION_INDEX_KEY = "airport-curation:v1:index";

export type AirportCurationStatus = "requested" | "draft" | "published" | "dismissed";

export interface AirportCurationRequest {
  iata: string;
  airportName: string;
  status: AirportCurationStatus;
  demandCount: number;
  /**
   * Arrivals coverage (customs/baggage_claim/ground_transport), tracked
   * independently from `status` (departures). Absent = never flagged missing
   * — either the layout already has arrivals nodes, or no one has hit the
   * gap yet. Same requested → draft → published → dismissed lifecycle,
   * managed via `setArrivalsCurationStatus`.
   */
  arrivalsStatus?: AirportCurationStatus;
  arrivalsDemandCount?: number;
  arrivalsFirstRequestedAt?: string;
  arrivalsLastRequestedAt?: string;
  firstRequestedAt: string;
  lastRequestedAt: string;
  officialMapUrl: string | null;
  officialMapProvider: string | null;
  officialMapVerified: boolean;
  /** Where demand was detected (e.g. "layout-api"). Deduplicated. Optional on legacy records. */
  detectedBy?: string[];
  /** Admin/verification notes. */
  notes?: string;
  /** Package revision this request was last linked to (draft or published save). */
  linkedPackageRevision?: number;
  /** M35 — lastVerifiedAt from published package or bundled seed source. */
  lastVerifiedAt?: string | null;
  /** M35 — fresh | aging | stale | unknown. */
  staleness?: LayoutStalenessStatus;
  /** True when past LAYOUT_STALENESS_DAYS — surface as needs re-verification. */
  needsReverification?: boolean;
  /** Short admin badge copy. */
  stalenessLabel?: string;
}

const MAX_DETECTED_BY_SOURCES = 12;

export function buildNextAirportCurationRequest(input: {
  iata: string;
  existing?: AirportCurationRequest | null;
  now?: Date;
  detectedBy?: string;
  /** True when the caller found a layout with no customs/baggage/ground-transport nodes. */
  arrivalsMissing?: boolean;
}): AirportCurationRequest {
  const iata = input.iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) throw new Error("Invalid airport IATA code");
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const officialMap = getAirportWayfindingResource(iata);
  const airport = getAirportNav(iata);
  const existing = input.existing;
  const lastRequestMs = existing ? Date.parse(existing.lastRequestedAt) : Number.NaN;
  const shouldIncrement =
    !existing
    || !Number.isFinite(lastRequestMs)
    || now.getTime() - lastRequestMs >= 5 * 60_000;
  const detectedBySource = input.detectedBy?.trim();
  const detectedBy = [...new Set([
    ...(existing?.detectedBy ?? []),
    ...(detectedBySource ? [detectedBySource] : []),
  ])].slice(0, MAX_DETECTED_BY_SOURCES);

  // Arrivals dimension: same sticky-status + 5-minute-dedup shape as departures,
  // but only tracked once something actually flags the gap (arrivalsMissing).
  const arrivalsLastMs = existing?.arrivalsLastRequestedAt
    ? Date.parse(existing.arrivalsLastRequestedAt)
    : Number.NaN;
  const arrivalsShouldIncrement =
    !existing?.arrivalsLastRequestedAt
    || !Number.isFinite(arrivalsLastMs)
    || now.getTime() - arrivalsLastMs >= 5 * 60_000;
  const arrivalsStatus =
    existing?.arrivalsStatus === "draft" || existing?.arrivalsStatus === "published"
      ? existing.arrivalsStatus
      : input.arrivalsMissing
        ? "requested"
        : existing?.arrivalsStatus;

  return {
    iata,
    airportName: airport?.name ?? `${iata} Airport`,
    status:
      existing?.status === "draft" || existing?.status === "published"
        ? existing.status
        : "requested",
    demandCount: (existing?.demandCount ?? 0) + (shouldIncrement ? 1 : 0),
    arrivalsStatus,
    arrivalsDemandCount: input.arrivalsMissing
      ? (existing?.arrivalsDemandCount ?? 0) + (arrivalsShouldIncrement ? 1 : 0)
      : existing?.arrivalsDemandCount,
    arrivalsFirstRequestedAt: input.arrivalsMissing
      ? (existing?.arrivalsFirstRequestedAt ?? nowIso)
      : existing?.arrivalsFirstRequestedAt,
    arrivalsLastRequestedAt: input.arrivalsMissing ? nowIso : existing?.arrivalsLastRequestedAt,
    firstRequestedAt: existing?.firstRequestedAt ?? nowIso,
    lastRequestedAt: nowIso,
    officialMapUrl: officialMap?.url ?? null,
    officialMapProvider: officialMap?.provider ?? null,
    officialMapVerified: Boolean(officialMap?.official && officialMap.verifiedAt),
    detectedBy,
    notes: existing?.notes,
    linkedPackageRevision: existing?.linkedPackageRevision,
  };
}

async function readCurationRequest(iata: string): Promise<AirportCurationRequest | null> {
  return kvStoreGet<AirportCurationRequest>(
    `${CURATION_KEY_PREFIX}${iata.trim().toUpperCase()}`,
    { userId: AIRPORT_LAYOUT_NAMESPACE },
  );
}

async function writeCurationRequest(request: AirportCurationRequest): Promise<void> {
  const currentIndex = await kvStoreGet<string[]>(CURATION_INDEX_KEY, {
    userId: AIRPORT_LAYOUT_NAMESPACE,
  }) ?? [];
  const nextIndex = [request.iata, ...currentIndex.filter((iata) => iata !== request.iata)].slice(0, 500);
  await Promise.all([
    kvStoreSet(`${CURATION_KEY_PREFIX}${request.iata}`, request, {
      userId: AIRPORT_LAYOUT_NAMESPACE,
    }),
    kvStoreSet(CURATION_INDEX_KEY, nextIndex, {
      userId: AIRPORT_LAYOUT_NAMESPACE,
    }),
  ]);
}

export async function recordAirportCurationDemand(
  iata: string,
  options?: { detectedBy?: string; arrivalsMissing?: boolean },
): Promise<AirportCurationRequest> {
  const code = iata.trim().toUpperCase();
  const existing = await readCurationRequest(code);
  const next = buildNextAirportCurationRequest({
    iata: code,
    existing,
    detectedBy: options?.detectedBy ?? "layout-api",
    arrivalsMissing: options?.arrivalsMissing,
  });
  await writeCurationRequest(next);
  return next;
}

export async function setAirportCurationStatus(
  iata: string,
  status: AirportCurationStatus,
  options?: { linkedPackageRevision?: number; notes?: string },
): Promise<AirportCurationRequest> {
  const code = iata.trim().toUpperCase();
  const existing = await readCurationRequest(code);
  const base = existing ?? buildNextAirportCurationRequest({ iata: code });
  const next: AirportCurationRequest = {
    ...base,
    status,
    ...(options?.linkedPackageRevision !== undefined
      ? { linkedPackageRevision: options.linkedPackageRevision }
      : {}),
    ...(options?.notes !== undefined ? { notes: options.notes } : {}),
  };
  await writeCurationRequest(next);
  return next;
}

/** Same admin lifecycle as setAirportCurationStatus, for the arrivals dimension. */
export async function setArrivalsCurationStatus(
  iata: string,
  arrivalsStatus: AirportCurationStatus,
  options?: { notes?: string },
): Promise<AirportCurationRequest> {
  const code = iata.trim().toUpperCase();
  const existing = await readCurationRequest(code);
  const base = existing ?? buildNextAirportCurationRequest({ iata: code, arrivalsMissing: true });
  const next: AirportCurationRequest = {
    ...base,
    arrivalsStatus,
    ...(options?.notes !== undefined ? { notes: options.notes } : {}),
  };
  await writeCurationRequest(next);
  return next;
}

export async function listAirportCurationRequests(): Promise<AirportCurationRequest[]> {
  const index = await kvStoreGet<string[]>(CURATION_INDEX_KEY, {
    userId: AIRPORT_LAYOUT_NAMESPACE,
  }) ?? [];
  const requests = await Promise.all(index.map((iata) => readCurationRequest(iata)));
  const enriched = await Promise.all(
    requests
      .filter((request): request is AirportCurationRequest => request !== null)
      .map(async (request) => enrichCurationWithStaleness(request)),
  );
  return enriched.sort((a, b) => {
      const statusRank: Record<AirportCurationStatus, number> = {
        requested: 0,
        draft: 1,
        published: 2,
        dismissed: 3,
      };
      // Stale published airports float above fresh ones of the same status.
      const staleRank = (r: AirportCurationRequest) => (r.needsReverification ? 0 : 1);
      return statusRank[a.status] - statusRank[b.status]
        || staleRank(a) - staleRank(b)
        || b.demandCount - a.demandCount
        || b.lastRequestedAt.localeCompare(a.lastRequestedAt);
    });
}

/** Attach M35 staleness from published package / bundled seed. */
export async function enrichCurationWithStaleness(
  request: AirportCurationRequest,
  now: Date = new Date(),
): Promise<AirportCurationRequest> {
  const published = await getStoredAirportLayoutPackage(request.iata, "published");
  const draft = published ? null : await getStoredAirportLayoutPackage(request.iata, "draft");
  const pkg = published ?? draft;
  const lastVerifiedAt =
    pkg?.source.lastVerifiedAt
    ?? (getAirportLayout(request.iata) ? bundledSource(request.iata).lastVerifiedAt : null);
  const staleness = layoutStalenessStatus(lastVerifiedAt, now);
  const needsReverification = isLayoutStale(lastVerifiedAt, now);
  return {
    ...request,
    lastVerifiedAt,
    staleness,
    needsReverification,
    stalenessLabel: stalenessLabel(staleness),
  };
}
