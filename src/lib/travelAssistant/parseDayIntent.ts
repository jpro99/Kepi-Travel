export type DayIntentKind = "stay" | "move" | "arrive" | "depart" | "unknown";

export interface ParsedDayIntent {
  kind: DayIntentKind;
  raw: string;
  fromCity?: string;
  toCity?: string;
  stayCity?: string;
  needsTransport: boolean;
  needsHotelCheckout: boolean;
  needsHotelCheckin: boolean;
  summary: string;
}

function cleanCity(fragment: string): string {
  return fragment
    .replace(/\bon\b.*$/iu, "")
    .replace(/\bthis day\b/iu, "")
    .replace(/[.,!?]+$/u, "")
    .trim();
}

function titleCase(city: string): string {
  return city
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function parseDayIntent(text: string): ParsedDayIntent | null {
  const raw = text.trim();
  if (!raw) return null;

  const movePatterns = [
    /\bleave\s+(.+?)[,\s]+(?:and\s+)?(?:go(?:\s+to)?|head(?:\s+to)?|travel(?:\s+to)?|get(?:\s+to)?)\s+(.+)/iu,
    /\b(?:from|leaving)\s+(.+?)\s+(?:to|→|-)\s+(.+)/iu,
    /^(.+?)\s+(?:to|→|-)\s+(.+)$/iu,
  ];

  for (const pattern of movePatterns) {
    const match = pattern.exec(raw);
    if (match?.[1] && match[2]) {
      const fromCity = titleCase(cleanCity(match[1]));
      const toCity = titleCase(cleanCity(match[2]));
      if (fromCity.length >= 2 && toCity.length >= 2 && fromCity.toLowerCase() !== toCity.toLowerCase()) {
        return {
          kind: "move",
          raw,
          fromCity,
          toCity,
          needsTransport: true,
          needsHotelCheckout: true,
          needsHotelCheckin: true,
          summary: `Leave ${fromCity} → stay in ${toCity}`,
        };
      }
    }
  }

  if (/\b(?:fly home|return home|head home)\b/iu.test(raw)) {
    return {
      kind: "depart",
      raw,
      needsTransport: true,
      needsHotelCheckout: true,
      needsHotelCheckin: false,
      summary: "Travel home",
    };
  }

  if (/\b(?:arrive|arriving|land in|get to|go to|stay in|staying in)\b/iu.test(raw)) {
    const cityMatch = raw.match(/\b(?:arrive(?:\s+in)?|arriving(?:\s+in)?|land in|get to|go to|stay in|staying in)\s+(.+)/iu);
    const stayCity = titleCase(cleanCity(cityMatch?.[1] ?? raw));
    return {
      kind: "arrive",
      raw,
      stayCity,
      toCity: stayCity,
      needsTransport: /\b(?:arrive|land|fly)\b/iu.test(raw),
      needsHotelCheckout: false,
      needsHotelCheckin: true,
      summary: `Stay in ${stayCity}`,
    };
  }

  if (raw.length >= 2 && raw.length <= 64 && !/\d{4}-\d{2}-\d{2}/u.test(raw)) {
    const stayCity = titleCase(cleanCity(raw));
    return {
      kind: "stay",
      raw,
      stayCity,
      toCity: stayCity,
      needsTransport: false,
      needsHotelCheckout: false,
      needsHotelCheckin: true,
      summary: `In ${stayCity}`,
    };
  }

  return {
    kind: "unknown",
    raw,
    needsTransport: /\b(?:fly|train|bus|drive|travel|leave)\b/iu.test(raw),
    needsHotelCheckout: /\b(?:leave|checkout|check out)\b/iu.test(raw),
    needsHotelCheckin: /\b(?:stay|hotel|airbnb|check in|check-in|arrive)\b/iu.test(raw),
    summary: raw,
  };
}
