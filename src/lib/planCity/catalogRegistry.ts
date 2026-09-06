import lecceCatalogJson from "@/data/planCity/lecce.catalog.json";
import type { PlanCityCatalog } from "@/lib/planCity/types";
import { validateCatalog } from "@/lib/planCity/provenance";

const BUNDLED: Record<string, PlanCityCatalog> = {
  lecce: validateCatalog(lecceCatalogJson as PlanCityCatalog),
};

export function listBundledPlanCityIds(): string[] {
  return Object.keys(BUNDLED);
}

export function getPlanCityCatalog(cityId: string): PlanCityCatalog | null {
  return BUNDLED[cityId] ?? null;
}

export function getPlanCityCatalogByKey(cityKey: string): PlanCityCatalog | null {
  const catalog = getPlanCityCatalog(cityKey);
  if (catalog) return catalog;
  return null;
}

/** All bundled catalogs — for typed city search fallback (thin until Facts run). */
export function listPlanCityCatalogs(): PlanCityCatalog[] {
  return Object.values(BUNDLED);
}
