/**
 * Vercel Blob storage for airport layout payloads.
 * Redis keeps small package metadata + a Blob URL pointer; the (potentially
 * large) AirportLayout JSON lives here. When BLOB_READ_WRITE_TOKEN is missing
 * (local dev, tests, misconfigured env) callers fall back to storing the
 * layout inline in Redis — that fallback is what keeps SEA working with
 * empty env (law M13 / D-series "SEA survives empty env").
 */

import { logger } from "@/lib/logger";

const BLOB_PATH_PREFIX = "airport-layouts";
const SCOPE = "airportNav/airportLayoutBlob";

export function hasAirportLayoutBlobConfig(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * Upload one immutable layout payload for a package revision.
 * Returns the public Blob URL, or null when Blob is unavailable — callers
 * must then store the layout inline instead of failing the save.
 */
export async function putAirportLayoutBlob(input: {
  iata: string;
  revision: number;
  status: "draft" | "published";
  layout: unknown;
}): Promise<string | null> {
  if (!hasAirportLayoutBlobConfig()) return null;
  try {
    const { put } = await import("@vercel/blob");
    const path = `${BLOB_PATH_PREFIX}/${input.iata}/rev-${input.revision}-${input.status}.json`;
    const uploaded = await put(path, JSON.stringify(input.layout), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return uploaded.url;
  } catch (error) {
    logger.error("Airport layout Blob upload failed; storing layout inline instead.", {
      scope: SCOPE,
      iata: input.iata,
      revision: input.revision,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/** Fetch a layout payload back from its Blob URL. Null on any failure. */
export async function getAirportLayoutBlobJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      logger.error("Airport layout Blob fetch returned non-OK status.", {
        scope: SCOPE,
        status: response.status,
      });
      return null;
    }
    return (await response.json()) as unknown;
  } catch (error) {
    logger.error("Airport layout Blob fetch failed.", {
      scope: SCOPE,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
