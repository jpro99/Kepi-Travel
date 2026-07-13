import { getAirportWayfindingResource } from "@/lib/airportNav/officialWayfinding";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const AIRPORT_LAYOUT_NAMESPACE = "__global_airport_layouts__";
const CURATION_KEY_PREFIX = "airport-curation:v1:";
const CURATION_INDEX_KEY = "airport-curation:v1:index";

export type AirportCurationStatus = "requested" | "draft" | "published" | "dismissed";

export interface AirportCurationRequest {
  iata: string;
  airportName: string;
  status: AirportCurationStatus;
  demandCount: number;
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
}

const MAX_DETECTED_BY_SOURCES = 12;

export function buildNextAirportCurationRequest(input: {
  iata: string;
  existing?: AirportCurationRequest | null;
  now?: Date;
  detectedBy?: string;
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

  return {
    iata,
    airportName: airport?.name ?? `${iata} Airport`,
    status:
      existing?.status === "draft" || existing?.status === "published"
        ? existing.status
        : "requested",
    demandCount: (existing?.demandCount ?? 0) + (shouldIncrement ? 1 : 0),
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
  options?: { detectedBy?: string },
): Promise<AirportCurationRequest> {
  const code = iata.trim().toUpperCase();
  const existing = await readCurationRequest(code);
  const next = buildNextAirportCurationRequest({
    iata: code,
    existing,
    detectedBy: options?.detectedBy ?? "layout-api",
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

export async function listAirportCurationRequests(): Promise<AirportCurationRequest[]> {
  const index = await kvStoreGet<string[]>(CURATION_INDEX_KEY, {
    userId: AIRPORT_LAYOUT_NAMESPACE,
  }) ?? [];
  const requests = await Promise.all(index.map((iata) => readCurationRequest(iata)));
  return requests
    .filter((request): request is AirportCurationRequest => request !== null)
    .sort((a, b) => {
      const statusRank: Record<AirportCurationStatus, number> = {
        requested: 0,
        draft: 1,
        published: 2,
        dismissed: 3,
      };
      return statusRank[a.status] - statusRank[b.status]
        || b.demandCount - a.demandCount
        || b.lastRequestedAt.localeCompare(a.lastRequestedAt);
    });
}
