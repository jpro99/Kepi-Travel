import type { PlanCityCatalog, PlanCityStop, PlanCityStopSource } from "@/lib/planCity/types";

const ALLOWED_SOURCE_KINDS = new Set([
  "official_text",
  "osm",
  "licensed_reviews",
  "traveler_saved",
]);

export class PlanCityProvenanceError extends Error {
  readonly code = "PLAN_CITY_PROVENANCE";

  constructor(message: string) {
    super(message);
    this.name = "PlanCityProvenanceError";
  }
}

export function assertStopSource(source: PlanCityStopSource): void {
  if (!source || typeof source !== "object") {
    throw new PlanCityProvenanceError("Stop missing source object");
  }
  if (!ALLOWED_SOURCE_KINDS.has(source.kind)) {
    throw new PlanCityProvenanceError(`Invalid source kind: ${String(source.kind)}`);
  }
  if (source.kind === "licensed_reviews" && !source.ref.trim().startsWith("osm:")) {
    throw new PlanCityProvenanceError("Licensed reviews v1 requires explicit OSM amenity ref");
  }
  if (!source.label?.trim()) {
    throw new PlanCityProvenanceError("Stop source missing label");
  }
  if (!source.ref?.trim()) {
    throw new PlanCityProvenanceError("Stop source missing ref");
  }
}

export function assertStopProvenance(stop: PlanCityStop): void {
  if (!stop.id?.trim()) throw new PlanCityProvenanceError("Stop missing id");
  if (!stop.name?.trim()) throw new PlanCityProvenanceError(`Stop ${stop.id} missing name`);
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) {
    throw new PlanCityProvenanceError(`Stop ${stop.id} missing coordinates`);
  }
  assertStopSource(stop.source);
  if (!stop.dwell || typeof stop.dwell.unknown !== "boolean") {
    throw new PlanCityProvenanceError(`Stop ${stop.id} missing dwell`);
  }
  if (!stop.dwell.unknown && !Number.isFinite(stop.dwell.minutes)) {
    throw new PlanCityProvenanceError(`Stop ${stop.id} dwell minutes required when not unknown`);
  }
}

export function validateCatalog(catalog: PlanCityCatalog): PlanCityCatalog {
  if (!catalog.cityId?.trim()) throw new PlanCityProvenanceError("Catalog missing cityId");
  if (!catalog.cityLabel?.trim()) throw new PlanCityProvenanceError("Catalog missing cityLabel");
  if (!Array.isArray(catalog.stops) || catalog.stops.length === 0) {
    throw new PlanCityProvenanceError(`Catalog ${catalog.cityId} has no stops`);
  }
  const ids = new Set<string>();
  for (const stop of catalog.stops) {
    assertStopProvenance(stop);
    if (ids.has(stop.id)) {
      throw new PlanCityProvenanceError(`Duplicate stop id ${stop.id}`);
    }
    ids.add(stop.id);
  }
  return catalog;
}

/** Reject LLM/blog-style invented stops — every stop must ship with a real source ref. */
export function rejectInventedStop(candidate: Partial<PlanCityStop>): void {
  if (!candidate.source?.ref?.trim()) {
    throw new PlanCityProvenanceError("Rejected invented stop without source ref");
  }
  if (candidate.source.kind === "licensed_reviews" && !candidate.source.ref.startsWith("osm:")) {
    // v1: licensed reviews not wired — block silent blog imports.
    throw new PlanCityProvenanceError("Licensed reviews v1 requires explicit OSM amenity ref");
  }
}

export function sourceChipLabel(kind: PlanCityStopSource["kind"]): string {
  switch (kind) {
    case "official_text":
      return "Official TEXT";
    case "osm":
      return "OSM";
    case "licensed_reviews":
      return "Licensed reviews";
    case "traveler_saved":
      return "Traveler-saved";
    default:
      return kind;
  }
}
