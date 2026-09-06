import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { listPlanCityCatalogs } from "@/lib/planCity/catalogRegistry";

/** Map display names / aliases → bundled catalog cityId. */
const CITY_ID_ALIASES: Record<string, string> = {
  lecce: "lecce",
  "lecce italy": "lecce",
  "lecce, italy": "lecce",
};

function normalizeCityKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolvePlanCityCatalogId(rawCity: string): string | null {
  const trimmed = rawCity.trim();
  if (!trimmed) return null;

  const aliasHit = CITY_ID_ALIASES[normalizeCityKey(trimmed)];
  if (aliasHit) return aliasHit;

  const formatted = formatHotelSearchCityLabel(trimmed);
  const aliasFormatted = CITY_ID_ALIASES[normalizeCityKey(formatted.label)];
  if (aliasFormatted) return aliasFormatted;

  for (const catalog of listPlanCityCatalogs()) {
    if (normalizeCityKey(catalog.cityLabel) === normalizeCityKey(trimmed)) return catalog.cityId;
    if (normalizeCityKey(catalog.cityId) === normalizeCityKey(trimmed)) return catalog.cityId;
  }

  const normalized = normalizeDayPlanCity(trimmed);
  const aliasNorm = CITY_ID_ALIASES[normalizeCityKey(normalized)];
  if (aliasNorm) return aliasNorm;

  return null;
}

export function displayPlanCityLabel(rawCity: string): string {
  const catalogId = resolvePlanCityCatalogId(rawCity);
  if (catalogId) {
    const hit = listPlanCityCatalogs().find((c) => c.cityId === catalogId);
    if (hit) return hit.cityLabel;
  }
  return normalizeDayPlanCity(rawCity) || rawCity.trim();
}
