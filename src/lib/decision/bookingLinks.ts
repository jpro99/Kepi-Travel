/** Resolve where the traveler should purchase — guide links, not Kepi checkout. */

const AIRLINE_HOME: Record<string, string> = {
  alaska: "https://www.alaskaair.com",
  "alaska airlines": "https://www.alaskaair.com",
  united: "https://www.united.com",
  delta: "https://www.delta.com",
  american: "https://www.aa.com",
  lufthansa: "https://www.lufthansa.com",
  british: "https://www.britishairways.com",
  "british airways": "https://www.britishairways.com",
  air: "https://www.airfrance.com",
  "air france": "https://www.airfrance.com",
  klm: "https://www.klm.com",
  swiss: "https://www.swiss.com",
  ita: "https://www.itaspa.com",
  jetblue: "https://www.jetblue.com",
  southwest: "https://www.southwest.com",
  emirates: "https://www.emirates.com",
  qatar: "https://www.qatarairways.com",
  singapore: "https://www.singaporeair.com",
};

export function buildGoogleFlightsUrl(input: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
}): string {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const outbound = `Flights from ${origin} to ${destination} on ${input.departureDate}`;
  const query = input.returnDate ? `${outbound} returning ${input.returnDate}` : outbound;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

export function resolveAirlineHomeUrl(airline: string): string | null {
  const lower = airline.toLowerCase();
  for (const [key, url] of Object.entries(AIRLINE_HOME)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

export function resolveCashBookUrl(input: {
  origin: string;
  destination: string;
  departureDate: string;
  airline?: string;
  /** Present when Duffel returned a live offer — prefer route-specific Google Flights. */
  offerId?: string;
  quotedPriceUsd?: number;
  flightNumber?: string;
}): { url: string; label: string } {
  const googleUrl = buildGoogleFlightsUrl(input);

  if (input.offerId?.trim()) {
    const airlineBit = input.airline?.split(" ")[0] ?? "Flight";
    const flightBit = input.flightNumber ? ` ${input.flightNumber}` : "";
    const priceBit =
      input.quotedPriceUsd !== undefined
        ? ` · $${Math.round(input.quotedPriceUsd).toLocaleString()} verified`
        : " · live quote";
    return {
      url: googleUrl,
      label: `${airlineBit}${flightBit} on Google Flights${priceBit} ↗`,
    };
  }

  const airlineUrl = input.airline ? resolveAirlineHomeUrl(input.airline) : null;
  if (airlineUrl) {
    return {
      url: airlineUrl,
      label: `Book on ${input.airline?.split(" ")[0] ?? "airline"} ↗`,
    };
  }

  return {
    url: googleUrl,
    label: "Search on Google Flights ↗",
  };
}
