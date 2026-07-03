/** Common misspellings and alternate names → canonical lookup key in HOTEL_CITY_COORDS. */
export const HOTEL_DESTINATION_ALIASES: Record<string, string> = {
  monopoly: "monopoli",
  "monopoly italy": "monopoli",
  "monopoly, italy": "monopoli",
  "monopoli italy": "monopoli",
  "monopoli, italy": "monopoli",
  polignano: "polignano a mare",
  "polignano a mare": "polignano a mare",
  "polignano amar": "polignano a mare",
  "polignano a mare italy": "polignano a mare",
  "polignano, italy": "polignano a mare",
  lecce: "lecce",
  "lecce italy": "lecce",
  ortisei: "ortisei",
  ortese: "ortisei",
  ortesei: "ortisei",
  "ortesei italy": "ortisei",
  "cortina d ampezzo": "cortina",
  "cortina d'ampezzo": "cortina",
  "bari italy": "bari",
  "rome italy": "rome",
  "roma italy": "rome",
  "venice italy": "venice",
  "florence italy": "florence",
  "firenze italy": "florence",
  "naples italy": "naples",
  "new york city": "new york",
  nyc: "new york",
  la: "los angeles",
  "los angeles ca": "los angeles",
};

export function normalizeHotelDestinationQuery(raw: string): { query: string; correctedFrom?: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { query: "" };

  const lower = trimmed.toLowerCase();
  const aliasHit = HOTEL_DESTINATION_ALIASES[lower];
  if (aliasHit) {
    return { query: aliasHit, correctedFrom: trimmed };
  }

  const withoutCountry = lower.replace(/,\s*(italy|it|usa|us|uk|france|spain|germany)\s*$/i, "").trim();
  if (withoutCountry !== lower && HOTEL_DESTINATION_ALIASES[withoutCountry]) {
    return { query: HOTEL_DESTINATION_ALIASES[withoutCountry], correctedFrom: trimmed };
  }
  if (withoutCountry !== lower) {
    return { query: withoutCountry, correctedFrom: trimmed };
  }

  return { query: trimmed };
}

/** Fuzzy suggestions when geocoding fails (typo help). */
export function suggestHotelDestinations(raw: string): string[] {
  const lower = raw.trim().toLowerCase();
  const suggestions: string[] = [];

  if (/monop|monopol/i.test(lower)) {
    suggestions.push("Monopoli, Italy", "Bari (BRI)", "Brindisi (BDS)");
  }
  if (/lecce|salento|puglia/i.test(lower)) {
    suggestions.push("Lecce, Italy", "Monopoli, Italy", "Bari (BRI)", "Brindisi (BDS)");
  }
  if (/\b(italy|italia)\b/i.test(lower) && suggestions.length === 0) {
    suggestions.push("Rome (FCO)", "Florence (FLR)", "Venice (VCE)", "Bari (BRI)");
  }

  return suggestions.slice(0, 4);
}
