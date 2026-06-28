/** Resolve where the traveler should purchase — guide links, not Kepi checkout. */

import {
  appendGoogleHotelsAffiliateParams,
  buildBookingComSearchUrl,
} from "@/lib/hotels/hotelAffiliateLinks";
import {
  buildAirlineBookUrl,
  buildHotelChainBookUrl,
  matchAirlineChain,
  matchHotelChain,
  resolveAirlineChainBookUrl,
  resolveHotelChainBookUrl,
  AIRLINE_CHAINS,
  type AirlineChainId,
  type HotelChainId,
} from "@/lib/loyalty/chainRegistry";

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
  returnDate?: string;
  passengers?: number;
  airline?: string;
  airlineIata?: string;
  /** Present when Duffel returned a live offer — prefer route-specific Google Flights. */
  offerId?: string;
  quotedPriceUsd?: number;
  flightNumber?: string;
}): { url: string; label: string } {
  const chainLink = resolveAirlineChainBookUrl(input.airline, input.airlineIata, {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    passengers: input.passengers,
    usePoints: false,
  });
  const googleUrl = buildGoogleFlightsUrl(input);

  if (input.offerId?.trim()) {
    const airlineBit = input.airline?.split(" ")[0] ?? "Flight";
    const flightBit = input.flightNumber ? ` ${input.flightNumber}` : "";
    const priceBit =
      input.quotedPriceUsd !== undefined
        ? ` · $${Math.round(input.quotedPriceUsd).toLocaleString()} verified`
        : " · live quote";
    return {
      url: chainLink?.url ?? googleUrl,
      label: `${airlineBit}${flightBit} on ${chainLink ? chainLink.label.replace(" ↗", "") : "Google Flights"}${priceBit} ↗`,
    };
  }

  if (chainLink) {
    return { url: chainLink.url, label: chainLink.label };
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
  returnDate?: string;
  passengers?: number;
  milesCost: number;
  verifyUrl?: string;
}): { url: string; label: string } {
  const programKey = input.program.toLowerCase();
  const chainFromId = AIRLINE_CHAINS.find((chain) => chain.id === programKey)?.id;
  const chainId = chainFromId ?? matchAirlineChain(input.program);
  const chainLink =
    chainId &&
    buildAirlineBookUrl(chainId, {
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      passengers: input.passengers,
      usePoints: true,
    });

  if (chainLink) {
    return {
      url: chainLink,
      label: `Book ${input.milesCost.toLocaleString()} mi on ${input.program} ↗`,
    };
  }

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
      returnDate: input.returnDate,
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
  /** City/region with country — anchors Google away from the user's GPS. */
  location?: string;
  destination?: string;
  /** Optional street address; never used alone without destination. */
  address?: string;
  checkInDate: string;
  checkOutDate: string;
}): string {
  const destination = normalizeGoogleHotelsDestination(input.destination ?? input.location ?? "");
  const propertyName = input.propertyName.trim();
  const address = input.address?.trim();
  const dates = `on ${input.checkInDate} through ${input.checkOutDate}`;

  let query: string;
  const isAreaSearch = /^(hotels?)$/i.test(propertyName);
  if (isAreaSearch) {
    query = destination ? `Hotels in ${destination} ${dates}` : `Hotels ${dates}`;
  } else if (destination) {
    query = `${propertyName} ${destination} ${dates}`;
    const destStem = destination.split(",")[0]?.trim().toLowerCase() ?? "";
    if (address && destStem && !address.toLowerCase().includes(destStem)) {
      query = `${propertyName} ${address} ${destination} ${dates}`;
    }
  } else {
    query = `${propertyName} ${dates}`;
  }

  if (destination) {
    return appendGoogleHotelsAffiliateParams(
      `https://www.google.com/travel/hotels/${encodeURIComponent(destination)}?q=${encodeURIComponent(query)}`,
    );
  }

  return appendGoogleHotelsAffiliateParams(
    `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}`,
  );
}

function normalizeGoogleHotelsDestination(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (/,/.test(trimmed)) return trimmed;

  if (
    /\b(italy|italia|france|spain|greece|portugal|germany|uk|united kingdom|usa|united states)\b/i.test(trimmed)
  ) {
    return trimmed;
  }

  if (
    /\b(monopoli|polignano|bari|lecce|matera|alberobello|ostuni|rome|venice|florence|naples|milan|amalfi|positano)\b/i.test(
      trimmed,
    )
  ) {
    return `${trimmed}, Italy`;
  }

  return trimmed;
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
  destination?: string;
  address?: string;
  checkInDate: string;
  checkOutDate: string;
  guests?: number;
  rooms?: number;
  quotedPriceUsd?: number;
  quoteId?: string;
  usePoints?: boolean;
}): { url: string; label: string; bookingComUrl?: string; chainBookUrl?: string } {
  const destination = input.destination ?? input.location ?? "";
  const chainLink = resolveHotelChainBookUrl(input.chainName, input.propertyName, {
    propertyName: input.propertyName,
    city: destination,
    checkIn: input.checkInDate,
    checkOut: input.checkOutDate,
    guests: input.guests,
    rooms: input.rooms,
    usePoints: input.usePoints,
  });

  const googleUrl = buildGoogleHotelsUrl({
    propertyName: input.propertyName,
    destination,
    address: input.address,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
  });
  const bookingComUrl =
    buildBookingComSearchUrl({
      destination,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      propertyName: input.propertyName,
    }) ?? undefined;
  const isLiveQuote = Boolean(input.quoteId?.trim() && !input.quoteId.startsWith("est-"));

  if (chainLink) {
    const shortName = input.propertyName.split(/\s+/).slice(0, 4).join(" ");
    const priceBit =
      input.quotedPriceUsd !== undefined
        ? ` · $${Math.round(input.quotedPriceUsd).toLocaleString()}`
        : isLiveQuote
          ? " · live quote"
          : "";
    return {
      url: chainLink.url,
      label: input.usePoints ? chainLink.label : `${shortName} on ${chainLink.label.replace(" ↗", "")}${priceBit} ↗`,
      bookingComUrl,
      chainBookUrl: chainLink.url,
    };
  }

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
      bookingComUrl,
    };
  }

  const chainUrl = input.chainName ? resolveHotelChainHomeUrl(input.chainName) : null;
  if (chainUrl) {
    const chainId = matchHotelChain(input.chainName, input.propertyName);
    const prefilled =
      chainId &&
      buildHotelChainBookUrl(chainId, {
        propertyName: input.propertyName,
        city: destination,
        checkIn: input.checkInDate,
        checkOut: input.checkOutDate,
        guests: input.guests,
        rooms: input.rooms,
        usePoints: input.usePoints,
      });
    return {
      url: prefilled ?? chainUrl,
      label: `Book on ${input.chainName?.split(" ")[0] ?? "chain"} ↗`,
      bookingComUrl,
      chainBookUrl: prefilled ?? chainUrl,
    };
  }

  return {
    url: googleUrl,
    label: "Search on Google Hotels ↗",
    bookingComUrl,
  };
}

/** Link-out for redeeming hotel points on the chain site (not Kepi checkout). */
export function resolveHotelPointsBookUrl(input: {
  propertyName: string;
  chainName?: string;
  programName?: string;
  destination?: string;
  address?: string;
  checkInDate: string;
  checkOutDate: string;
}): { url: string; label: string; bookingComUrl?: string } {
  const chainUrl = input.chainName ? resolveHotelChainHomeUrl(input.chainName) : null;
  const chainLabel = input.programName ?? input.chainName?.split(" ")[0] ?? "Hotel";
  const bookingComUrl =
    buildBookingComSearchUrl({
      destination: input.destination ?? "",
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      propertyName: input.propertyName,
    }) ?? undefined;

  if (chainUrl) {
    return {
      url: chainUrl,
      label: `Redeem ${chainLabel} points on ${chainLabel}.com ↗`,
      bookingComUrl,
    };
  }

  const googleUrl = buildGoogleHotelsUrl({
    propertyName: input.propertyName,
    destination: input.destination,
    address: input.address,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
  });

  return {
    url: googleUrl,
    label: "Compare cash vs points on Google ↗",
    bookingComUrl,
  };
}
