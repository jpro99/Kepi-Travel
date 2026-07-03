import { normalizeHotelDestinationQuery } from "@/lib/hotels/destinationAliases";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";

const VOICE_CITY_FIXES: Record<string, string> = {
  ortese: "ortisei",
  ortesei: "ortisei",
  monopoly: "monopoli",
  "palermo amar": "polignano a mare",
  "polignano amar": "polignano a mare",
  "polignano a mar": "polignano a mare",
  amalfi: "amalfi",
  "palermo amalfi": "palermo",
};

/** Canonical display name for a city fragment from day notes or voice input. */
export function normalizeDayPlanCity(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase().replace(/[.,!?]+$/u, "");
  const voiceHit = VOICE_CITY_FIXES[lower];
  if (voiceHit) {
    return formatHotelSearchCityLabel(voiceHit).label || titleCaseWords(voiceHit);
  }

  const alias = normalizeHotelDestinationQuery(trimmed);
  const formatted = formatHotelSearchCityLabel(alias.query || trimmed);
  const label = formatted.label || trimmed;
  return titleCaseWords(label.split("(")[0]?.trim() || label);
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function stripTrailingDateNoise(fragment: string): string {
  return fragment
    .replace(/\bon\b.*$/iu, "")
    .replace(/\b(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?(?:\s+of\s+\w+)?.*$/iu, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?.*$/u, "")
    .replace(/\bthis day\b/iu, "")
    .replace(/[.,!?]+$/u, "")
    .trim();
}
