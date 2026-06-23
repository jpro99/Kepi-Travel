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

const AWARD_PROGRAM_BOOK: Partial<Record<string, string>> = {
  alaska: "https://www.alaskaair.com",
  united: "https://www.united.com",
  american: "https://www.aa.com",
  delta: "https://www.delta.com",
  aeroplan: "https://www.aircanada.com/aeroplan",
  flyingblue: "https://www.airfrance.com",
  avios_ba: "https://www.britishairways.com",
  lifemiles: "https://www.lifemiles.com",
  singapore_krisflyer: "https://www.singaporeair.com",
};

export function resolveAwardBookUrl(input: {
  program: string;
  origin: string;
  destination: string;
  departureDate: string;
  milesCost: number;
  verifyUrl?: string;
}): { url: string; label: string } {
  const programUrl = AWARD_PROGRAM_BOOK[input.program.toLowerCase()];
  if (programUrl) {
    return {
      url: programUrl,
      label: `Book ${input.milesCost.toLocaleString()} mi on ${input.program} ↗`,
    };
  }
  if (input.verifyUrl) {
    return {
      url: input.verifyUrl,
      label: "Verify & book on Seats.aero ↗",
    };
  }
  return {
    url: buildGoogleFlightsUrl({
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
    }),
    label: "Search award space ↗",
  };
}

const HOTEL_CHAIN_HOME: Record<string, string> = {
  marriott: "https://www.marriott.com",
  hilton: "https://www.hilton.com",
  hyatt: "https://www.hyatt.com",
  ihg: "https://www.ihg.com",
  "intercontinental": "https://www.ihg.com",
  accor: "https://all.accor.com",
  wyndham: "https://www.wyndhamhotels.com",
  choice: "https://www.choicehotels.com",
  best: "https://www.bestwestern.com",
  "best western": "https://www.bestwestern.com",
  radisson: "https://www.radissonhotels.com",
  four: "https://www.fourseasons.com",
  "four seasons": "https://www.fourseasons.com",
  kimpton: "https://www.kimptonhotels.com",
};

export function buildGoogleHotelsUrl(input: {
  propertyName: string;
  location?: string;
  checkInDate: string;
  checkOutDate: string;
}): string {
  const locationBit = input.location?.trim() ? ` ${input.location.trim()}` : "";
  const query = `${input.propertyName}${locationBit} ${input.checkInDate} to ${input.checkOutDate}`;
  return `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}`;
}

export function resolveHotelChainHomeUrl(chainName: string): string | null {
  const lower = chainName.toLowerCase();
  for (const [key, url] of Object.entries(HOTEL_CHAIN_HOME)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

export function resolveHotelBookUrl(input: {
  propertyName: string;
  chainName?: string;
  location?: string;
  checkInDate: string;
  checkOutDate: string;
  quotedPriceUsd?: number;
  quoteId?: string;
}): { url: string; label: string } {
  const googleUrl = buildGoogleHotelsUrl(input);
  const isLiveQuote = Boolean(input.quoteId?.trim() && !input.quoteId.startsWith("est-"));

  if (isLiveQuote || input.quotedPriceUsd !== undefined) {
    const shortName = input.propertyName.split(/\s+/).slice(0, 4).join(" ");
    const priceBit =
      input.quotedPriceUsd !== undefined
        ? ` · $${Math.round(input.quotedPriceUsd).toLocaleString()}`
        : isLiveQuote
          ? " · live quote"
          : "";
    return {
      url: googleUrl,
      label: `${shortName} on Google Hotels${priceBit} ↗`,
    };
  }

  const chainUrl = input.chainName ? resolveHotelChainHomeUrl(input.chainName) : null;
  if (chainUrl) {
    return {
      url: chainUrl,
      label: `Book on ${input.chainName?.split(" ")[0] ?? "chain"} ↗`,
    };
  }

  return {
    url: googleUrl,
    label: "Search on Google Hotels ↗",
  };
}
