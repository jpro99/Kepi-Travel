/** Hotel chains and airlines that participate in points/miles programs. */

export type HotelChainId = "hyatt" | "marriott" | "hilton" | "ihg";

export type AirlineChainId =
  | "alaska"
  | "united"
  | "delta"
  | "american"
  | "southwest"
  | "jetblue"
  | "british"
  | "air_france"
  | "singapore";

export interface HotelChainDef {
  id: HotelChainId;
  label: string;
  programName: string;
  matchers: RegExp[];
}

export interface AirlineChainDef {
  id: AirlineChainId;
  label: string;
  programName: string;
  iataCodes: string[];
  matchers: RegExp[];
}

export const HOTEL_CHAINS: HotelChainDef[] = [
  {
    id: "hyatt",
    label: "Hyatt",
    programName: "World of Hyatt",
    matchers: [/hyatt|andaz|thompson|unbound|park hyatt|grand hyatt|caption by hyatt/i],
  },
  {
    id: "marriott",
    label: "Marriott",
    programName: "Marriott Bonvoy",
    matchers: [/marriott|bonvoy|westin|sheraton|ritz|w hotel|st\.?\s*regis|autograph|moxy|aloft|le meridien|renaissance/i],
  },
  {
    id: "hilton",
    label: "Hilton",
    programName: "Hilton Honors",
    matchers: [/hilton|waldorf|conrad|curio|tapestry|doubletree|embassy suites|canopy by hilton/i],
  },
  {
    id: "ihg",
    label: "IHG",
    programName: "IHG One Rewards",
    matchers: [/\bihg\b|intercontinental|holiday inn|crowne plaza|kimpton|voco|even hotels|staybridge/i],
  },
];

export const AIRLINE_CHAINS: AirlineChainDef[] = [
  { id: "alaska", label: "Alaska", programName: "Mileage Plan", iataCodes: ["AS"], matchers: [/alaska/i] },
  { id: "united", label: "United", programName: "MileagePlus", iataCodes: ["UA"], matchers: [/united/i] },
  { id: "delta", label: "Delta", programName: "SkyMiles", iataCodes: ["DL"], matchers: [/delta/i] },
  { id: "american", label: "American", programName: "AAdvantage", iataCodes: ["AA"], matchers: [/american/i] },
  { id: "southwest", label: "Southwest", programName: "Rapid Rewards", iataCodes: ["WN"], matchers: [/southwest/i] },
  { id: "jetblue", label: "JetBlue", programName: "TrueBlue", iataCodes: ["B6"], matchers: [/jetblue/i] },
  { id: "british", label: "British Airways", programName: "Avios", iataCodes: ["BA"], matchers: [/british airways|\bba\b/i] },
  { id: "air_france", label: "Air France", programName: "Flying Blue", iataCodes: ["AF", "KL"], matchers: [/air france|flying blue|\bklm\b/i] },
  { id: "singapore", label: "Singapore", programName: "KrisFlyer", iataCodes: ["SQ"], matchers: [/singapore|krisflyer/i] },
];

export interface HotelBookParams {
  propertyName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  rooms?: number;
  usePoints?: boolean;
}

export interface FlightBookParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers?: number;
  cabin?: "economy" | "premium_economy" | "business" | "first";
  usePoints?: boolean;
}

function hotelHaystack(chainName?: string, hotelName?: string): string {
  return `${chainName ?? ""} ${hotelName ?? ""}`.trim();
}

export function matchHotelChain(chainName?: string, hotelName?: string): HotelChainId | null {
  const haystack = hotelHaystack(chainName, hotelName);
  if (!haystack) return null;
  for (const chain of HOTEL_CHAINS) {
    if (chain.matchers.some((matcher) => matcher.test(haystack))) return chain.id;
  }
  return null;
}

export function hotelParticipatesInPoints(chainName?: string, hotelName?: string): boolean {
  return matchHotelChain(chainName, hotelName) !== null;
}

export function matchAirlineChain(airlineName?: string, iataCode?: string): AirlineChainId | null {
  const code = iataCode?.trim().toUpperCase();
  if (code) {
    const byCode = AIRLINE_CHAINS.find((chain) => chain.iataCodes.includes(code));
    if (byCode) return byCode.id;
  }
  const haystack = (airlineName ?? "").trim();
  if (!haystack) return null;
  for (const chain of AIRLINE_CHAINS) {
    if (chain.matchers.some((matcher) => matcher.test(haystack))) return chain.id;
  }
  return null;
}

export function airlineParticipatesInPoints(airlineName?: string, iataCode?: string): boolean {
  return matchAirlineChain(airlineName, iataCode) !== null;
}

function marriottDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function cityStem(city: string): string {
  return city.split(",")[0]?.trim() ?? city;
}

export function buildHotelChainBookUrl(chainId: HotelChainId, params: HotelBookParams): string {
  const guests = params.guests ?? 2;
  const rooms = params.rooms ?? 1;
  const city = cityStem(params.city);
  const cityEnc = encodeURIComponent(city);
  const propertyEnc = encodeURIComponent(params.propertyName);
  const points = params.usePoints ?? false;

  switch (chainId) {
    case "marriott": {
      const base = "https://www.marriott.com/search/findHotels.mi";
      const query = new URLSearchParams({
        searchType: "NearAddress",
        destinationAddress: params.propertyName,
        fromDate: marriottDate(params.checkIn),
        toDate: marriottDate(params.checkOut),
        roomCount: String(rooms),
        numAdultsPerRoom: String(guests),
        recordsPerPage: "20",
      });
      if (points) query.set("useRewardsPoints", "true");
      return `${base}?${query.toString()}`;
    }
    case "hilton": {
      const query = new URLSearchParams({
        query: `${params.propertyName} ${city}`,
        arrivalDate: params.checkIn,
        departureDate: params.checkOut,
        numRooms: String(rooms),
        numAdults: String(guests),
      });
      if (points) query.set("redeemPts", "true");
      return `https://www.hilton.com/en/search/?${query.toString()}`;
    }
    case "hyatt": {
      const term = encodeURIComponent(`${params.propertyName} ${city}`);
      const query = new URLSearchParams({
        checkin: params.checkIn,
        checkout: params.checkOut,
        rooms: String(rooms),
        adults: String(guests),
        kids: "0",
        rate: "Standard",
      });
      if (points) query.set("rateFilter", "woh");
      return `https://www.hyatt.com/search/hotels/en-US/${term}?${query.toString()}`;
    }
    case "ihg": {
      const query = new URLSearchParams({
        qDest: city,
        qStartDate: params.checkIn,
        qEndDate: params.checkOut,
        qCiD: params.checkIn,
        qCoD: params.checkOut,
        qAdlt: String(guests),
        qChld: "0",
        qRms: String(rooms),
        qSlH: propertyEnc,
      });
      if (points) query.set("qRwd", "1");
      return `https://www.ihg.com/hotels/us/en/find-hotels/select-roomrate?${query.toString()}`;
    }
    default:
      return `https://www.google.com/travel/hotels?q=${cityEnc}`;
  }
}

function deltaCabin(cabin?: FlightBookParams["cabin"]): string {
  if (cabin === "business") return "BE";
  if (cabin === "first") return "FIRST";
  if (cabin === "premium_economy") return "PE";
  return "BE";
}

export function buildAirlineBookUrl(chainId: AirlineChainId, params: FlightBookParams): string {
  const origin = params.origin.toUpperCase();
  const destination = params.destination.toUpperCase();
  const pax = String(params.passengers ?? 1);
  const roundTrip = Boolean(params.returnDate);
  const points = params.usePoints ?? false;

  switch (chainId) {
    case "alaska": {
      const query = new URLSearchParams({
        O: origin,
        D: destination,
        OD: params.departureDate,
        RT: roundTrip ? "true" : "false",
        UPGRADES: "NOUPGRADE",
      });
      if (roundTrip && params.returnDate) query.set("RD", params.returnDate);
      if (points) query.set("AWARD", "true");
      return `https://www.alaskaair.com/search/results?${query.toString()}`;
    }
    case "united": {
      const query = new URLSearchParams({
        f: origin,
        t: destination,
        d: params.departureDate,
        tt: roundTrip ? "2" : "1",
        sc: "7",
        px: pax,
        taxng: "1",
        newHP: "True",
      });
      if (roundTrip && params.returnDate) query.set("r", params.returnDate);
      if (points) query.set("AwardTravel", "true");
      return `https://www.united.com/en/us/fsr/choose-flights?${query.toString()}`;
    }
    case "delta": {
      const query = new URLSearchParams({
        action: "findFlights",
        dates: params.departureDate,
        originCity: origin,
        destinationCity: destination,
        pax,
        cabin: deltaCabin(params.cabin),
        tripType: roundTrip ? "ROUND_TRIP" : "ONE_WAY",
      });
      if (roundTrip && params.returnDate) query.set("returnDate", params.returnDate);
      if (points) query.set("awardTravel", "true");
      return `https://www.delta.com/flight-search/book-a-flight?${query.toString()}`;
    }
    case "american": {
      const compact = params.departureDate.replace(/-/g, "");
      const query = new URLSearchParams({
        ORIGIN: origin,
        DEST: destination,
        DATE: compact,
        TripType: roundTrip ? "RT" : "OW",
        PA: pax,
      });
      if (roundTrip && params.returnDate) query.set("RETURNDATE", params.returnDate.replace(/-/g, ""));
      if (points) query.set("AAT", "1");
      return `https://www.aa.com/booking/flights/choose-flights/1?${query.toString()}`;
    }
    case "southwest": {
      const query = new URLSearchParams({
        originationAirportCode: origin,
        destinationAirportCode: destination,
        departureDate: params.departureDate,
        adultPassengersCount: pax,
        tripType: roundTrip ? "roundtrip" : "oneway",
      });
      if (roundTrip && params.returnDate) query.set("returnDate", params.returnDate);
      if (points) query.set("fareType", "POINTS");
      return `https://www.southwest.com/air/booking/select-depart.html?${query.toString()}`;
    }
    case "jetblue": {
      const query = new URLSearchParams({
        from: origin,
        to: destination,
        depart: params.departureDate,
        adults: pax,
        isMultiCity: "false",
      });
      if (roundTrip && params.returnDate) {
        query.set("return", params.returnDate);
        query.set("isRoundTrip", "true");
      }
      if (points) query.set("usePoints", "true");
      return `https://www.jetblue.com/booking/flights?${query.toString()}`;
    }
    case "british":
      return points
        ? `https://www.britishairways.com/travel/redeem/execclub/_gf/en_gb?eId=111001&eName=RedeemFlights&departurePoint=${origin}&destinationPoint=${destination}&departing=${params.departureDate}`
        : `https://www.britishairways.com/travel/book/public/en_us?eId=111089&eName=FlightSearch&departurePoint=${origin}&destinationPoint=${destination}&departing=${params.departureDate}`;
    case "air_france": {
      const query = new URLSearchParams({
        activeConnection: "0",
        departure: origin,
        arrival: destination,
        outboundDate: params.departureDate,
        passengers: pax,
      });
      if (roundTrip && params.returnDate) query.set("inboundDate", params.returnDate);
      if (points) query.set("bookingFlow", "REWARD");
      return `https://wwws.airfrance.us/search/offers?${query.toString()}`;
    }
    case "singapore": {
      const query = new URLSearchParams({
        origin,
        destination,
        departureDate: params.departureDate,
        adults: pax,
        cabin: params.cabin ?? "economy",
      });
      if (roundTrip && params.returnDate) query.set("returnDate", params.returnDate);
      if (points) query.set("redeemMiles", "true");
      return `https://www.singaporeair.com/en_UK/plan-and-book/your-booking/book-a-flight/?${query.toString()}`;
    }
    default:
      return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination} on ${params.departureDate}`)}`;
  }
}

export function resolveHotelChainBookUrl(
  chainName: string | undefined,
  hotelName: string,
  params: HotelBookParams,
): { url: string; chainId: HotelChainId; label: string } | null {
  const chainId = matchHotelChain(chainName, hotelName);
  if (!chainId) return null;
  const chain = HOTEL_CHAINS.find((row) => row.id === chainId);
  const url = buildHotelChainBookUrl(chainId, params);
  const mode = params.usePoints ? "with points" : "on";
  return {
    url,
    chainId,
    label: `Book ${mode} ${chain?.label ?? chainId} ↗`,
  };
}

export function resolveAirlineChainBookUrl(
  airlineName: string | undefined,
  iataCode: string | undefined,
  params: FlightBookParams,
): { url: string; chainId: AirlineChainId; label: string } | null {
  const chainId = matchAirlineChain(airlineName, iataCode);
  if (!chainId) return null;
  const chain = AIRLINE_CHAINS.find((row) => row.id === chainId);
  const url = buildAirlineBookUrl(chainId, params);
  const mode = params.usePoints ? "with miles" : "on";
  return {
    url,
    chainId,
    label: `Book ${mode} ${chain?.label ?? chainId} ↗`,
  };
}
