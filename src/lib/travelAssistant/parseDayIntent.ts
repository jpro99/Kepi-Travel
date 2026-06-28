import { normalizeDayPlanCity, stripTrailingDateNoise } from "@/lib/travelAssistant/normalizeDayPlanCity";

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
  return normalizeDayPlanCity(stripTrailingDateNoise(fragment));
}

export function parseDayIntent(text: string): ParsedDayIntent | null {
  const raw = text.trim();
  if (!raw) return null;

  const goToMatch = raw.match(/\bgo(?:\s+to)?\s+(.+)/iu);
  if (goToMatch?.[1] && !/\bleave\b/iu.test(raw)) {
    const stayCity = cleanCity(goToMatch[1]);
    if (stayCity.length >= 2) {
      return {
        kind: "arrive",
        raw,
        stayCity,
        toCity: stayCity,
        needsTransport: true,
        needsHotelCheckout: false,
        needsHotelCheckin: true,
        summary: `Go to ${stayCity}`,
      };
    }
  }

  const movePatterns = [
    /\bleave(?:ing)?\s+(.+?)[,\s]+(?:and\s+)?(?:go(?:\s+to)?|head(?:\s+to)?|travel(?:\s+to)?|get(?:\s+to)?|for)\s+(.+)/iu,
    /\bleave(?:ing)?\s+(.+?)\s+(?:to|→|->)\s+(.+)/iu,
    /\b(?:from|leaving)\s+(.+?)\s+(?:to|→|->|-)\s+(.+)/iu,
  ];

  for (const pattern of movePatterns) {
    const match = pattern.exec(raw);
    if (match?.[1] && match[2]) {
      const fromCity = cleanCity(match[1]);
      const toCity = cleanCity(match[2]);
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

  const leaveOnly = raw.match(/\bleave(?:ing)?\s+(.+)/iu);
  if (
    leaveOnly?.[1] &&
    !/\b(?:go(?:\s+to)?|head(?:\s+to)?|travel(?:\s+to)?|get(?:\s+to)?|for)\s+\S/iu.test(raw)
  ) {
    const fromCity = cleanCity(leaveOnly[1]);
    if (fromCity.length >= 2) {
      return {
        kind: "depart",
        raw,
        fromCity,
        needsTransport: true,
        needsHotelCheckout: true,
        needsHotelCheckin: false,
        summary: `Leave ${fromCity}`,
      };
    }
  }

  if (/\b(?:arrive(?:\s+in)?|arriving(?:\s+in)?|land in|get to|stay in|staying in)\b/iu.test(raw)) {
    const cityMatch = raw.match(
      /\b(?:arrive(?:\s+in)?|arriving(?:\s+in)?|land in|get to|stay in|staying in)\s+(.+)/iu,
    );
    const stayCity = cleanCity(cityMatch?.[1] ?? raw);
    if (stayCity.length >= 2) {
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
  }

  if (/^in\s+/iu.test(raw)) {
    const stayCity = cleanCity(raw.replace(/^in\s+/iu, ""));
    if (stayCity.length >= 2) {
      return {
        kind: "stay",
        raw,
        stayCity,
        toCity: stayCity,
        needsTransport: false,
        needsHotelCheckout: false,
        needsHotelCheckin: false,
        summary: `In ${stayCity}`,
      };
    }
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
