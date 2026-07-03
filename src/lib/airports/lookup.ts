// Airport lookup — resolve city names and codes to IATA
// Covers US majors, EU majors, and common Kepi user destinations

const AIRPORTS: Record<string, { iata: string; name: string; city: string; country: string }> = {
  // California
  lax: { iata: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "US" },
  ont: { iata: "ONT", name: "Ontario International", city: "Ontario / Beaumont", country: "US" },
  sna: { iata: "SNA", name: "John Wayne Airport", city: "Orange County / Irvine", country: "US" },
  sfo: { iata: "SFO", name: "San Francisco International", city: "San Francisco", country: "US" },
  san: { iata: "SAN", name: "San Diego International", city: "San Diego", country: "US" },
  smf: { iata: "SMF", name: "Sacramento International", city: "Sacramento", country: "US" },
  // New York
  jfk: { iata: "JFK", name: "John F. Kennedy International", city: "New York", country: "US" },
  lga: { iata: "LGA", name: "LaGuardia Airport", city: "New York", country: "US" },
  ewr: { iata: "EWR", name: "Newark Liberty International", city: "New York / Newark", country: "US" },
  // Other US
  ord: { iata: "ORD", name: "O'Hare International", city: "Chicago", country: "US" },
  mdw: { iata: "MDW", name: "Midway International", city: "Chicago", country: "US" },
  mia: { iata: "MIA", name: "Miami International", city: "Miami", country: "US" },
  fll: { iata: "FLL", name: "Fort Lauderdale", city: "Fort Lauderdale", country: "US" },
  atl: { iata: "ATL", name: "Hartsfield-Jackson Atlanta", city: "Atlanta", country: "US" },
  dfw: { iata: "DFW", name: "Dallas/Fort Worth International", city: "Dallas", country: "US" },
  iah: { iata: "IAH", name: "George Bush Intercontinental", city: "Houston", country: "US" },
  sea: { iata: "SEA", name: "Seattle-Tacoma International", city: "Seattle", country: "US" },
  den: { iata: "DEN", name: "Denver International", city: "Denver", country: "US" },
  phx: { iata: "PHX", name: "Phoenix Sky Harbor", city: "Phoenix", country: "US" },
  las: { iata: "LAS", name: "Harry Reid International", city: "Las Vegas", country: "US" },
  bos: { iata: "BOS", name: "Boston Logan International", city: "Boston", country: "US" },
  iad: { iata: "IAD", name: "Dulles International", city: "Washington DC", country: "US" },
  dca: { iata: "DCA", name: "Reagan National", city: "Washington DC", country: "US" },
  phl: { iata: "PHL", name: "Philadelphia International", city: "Philadelphia", country: "US" },
  msp: { iata: "MSP", name: "Minneapolis-Saint Paul", city: "Minneapolis", country: "US" },
  dtw: { iata: "DTW", name: "Detroit Metropolitan", city: "Detroit", country: "US" },
  mco: { iata: "MCO", name: "Orlando International", city: "Orlando", country: "US" },
  tpa: { iata: "TPA", name: "Tampa International", city: "Tampa", country: "US" },
  // Italy
  fco: { iata: "FCO", name: "Fiumicino Airport", city: "Rome", country: "IT" },
  cia: { iata: "CIA", name: "Ciampino Airport", city: "Rome", country: "IT" },
  mxp: { iata: "MXP", name: "Malpensa International", city: "Milan", country: "IT" },
  lin: { iata: "LIN", name: "Linate Airport", city: "Milan", country: "IT" },
  vce: { iata: "VCE", name: "Marco Polo Airport", city: "Venice", country: "IT" },
  bri: { iata: "BRI", name: "Bari Karol Wojtyla Airport", city: "Bari", country: "IT" },
  nap: { iata: "NAP", name: "Naples International", city: "Naples", country: "IT" },
  flr: { iata: "FLR", name: "Peretola Airport", city: "Florence", country: "IT" },
  // Germany
  muc: { iata: "MUC", name: "Munich Airport", city: "Munich", country: "DE" },
  fra: { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "DE" },
  ber: { iata: "BER", name: "Brandenburg Airport", city: "Berlin", country: "DE" },
  ham: { iata: "HAM", name: "Hamburg Airport", city: "Hamburg", country: "DE" },
  // UK
  lhr: { iata: "LHR", name: "Heathrow Airport", city: "London", country: "GB" },
  lgw: { iata: "LGW", name: "Gatwick Airport", city: "London", country: "GB" },
  man: { iata: "MAN", name: "Manchester Airport", city: "Manchester", country: "GB" },
  // France
  cdg: { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "FR" },
  ory: { iata: "ORY", name: "Orly Airport", city: "Paris", country: "FR" },
  nce: { iata: "NCE", name: "Nice Côte d'Azur", city: "Nice", country: "FR" },
  // Spain
  mad: { iata: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "ES" },
  bcn: { iata: "BCN", name: "Barcelona El Prat", city: "Barcelona", country: "ES" },
  // Netherlands
  ams: { iata: "AMS", name: "Amsterdam Schiphol", city: "Amsterdam", country: "NL" },
  // Switzerland
  zrh: { iata: "ZRH", name: "Zurich Airport", city: "Zurich", country: "CH" },
  // Portugal
  lis: { iata: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "PT" },
  // Greece
  ath: { iata: "ATH", name: "Athens International", city: "Athens", country: "GR" },
  // Japan
  nrt: { iata: "NRT", name: "Narita International", city: "Tokyo", country: "JP" },
  hnd: { iata: "HND", name: "Haneda Airport", city: "Tokyo", country: "JP" },
  kix: { iata: "KIX", name: "Kansai International", city: "Osaka", country: "JP" },
  // Australia
  syd: { iata: "SYD", name: "Sydney Airport", city: "Sydney", country: "AU" },
  mel: { iata: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "AU" },
  // Canada
  yyz: { iata: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "CA" },
  yvr: { iata: "YVR", name: "Vancouver International", city: "Vancouver", country: "CA" },
  // Mexico
  mex: { iata: "MEX", name: "Benito Juárez International", city: "Mexico City", country: "MX" },
  cun: { iata: "CUN", name: "Cancún International", city: "Cancún", country: "MX" },
  // Hawaii
  hnl: { iata: "HNL", name: "Daniel K. Inouye International", city: "Honolulu", country: "US" },
  ogg: { iata: "OGG", name: "Kahului Airport", city: "Maui", country: "US" },
};

// City name aliases → lookup key
const CITY_ALIASES: Record<string, string> = {
  "los angeles": "lax", "la": "lax", "beaumont": "ont", "beaumont ca": "ont",
  "beaumont california": "ont", "ontario": "ont", "ontario ca": "ont",
  "orange county": "sna", "irvine": "sna", "santa ana": "sna",
  "san francisco": "sfo", "sf": "sfo", "san diego": "san",
  "new york": "jfk", "nyc": "jfk", "new york city": "jfk",
  "chicago": "ord", "miami": "mia", "atlanta": "atl", "dallas": "dfw",
  "houston": "iah", "seattle": "sea", "denver": "den", "phoenix": "phx",
  "las vegas": "las", "vegas": "las", "boston": "bos",
  "washington": "iad", "washington dc": "iad", "dc": "dca",
  "philadelphia": "phl", "philly": "phl", "minneapolis": "msp",
  "detroit": "dtw", "orlando": "mco", "tampa": "tpa",
  // Italy
  "rome": "fco", "roma": "fco", "milan": "mxp", "milano": "mxp",
  "venice": "vce", "venezia": "vce", "bari": "bri", "bari italy": "bri",
  "naples": "nap", "napoli": "nap", "florence": "flr", "firenze": "flr",
  // Germany
  "munich": "muc", "münchen": "muc", "frankfurt": "fra", "berlin": "ber",
  "hamburg": "ham",
  // UK
  "london": "lhr", "london heathrow": "lhr", "heathrow": "lhr",
  "manchester": "man",
  // France
  "paris": "cdg", "nice": "nce",
  // Spain
  "madrid": "mad", "barcelona": "bcn",
  // Netherlands
  "amsterdam": "ams",
  // Switzerland
  "zurich": "zrh", "zürich": "zrh",
  // Portugal
  "lisbon": "lis", "lisboa": "lis",
  // Greece
  "athens": "ath",
  // Japan
  "tokyo": "nrt", "osaka": "kix",
  // Australia
  "sydney": "syd", "melbourne": "mel",
  // Canada
  "toronto": "yyz", "vancouver": "yvr",
  // Mexico
  "mexico city": "mex", "cancun": "cun", "cancún": "cun",
  // Hawaii
  "honolulu": "hnl", "hawaii": "hnl", "maui": "ogg",
};

export interface AirportResult {
  iata: string;
  name: string;
  city: string;
  country: string;
}

export function resolveAirport(input: string): AirportResult | null {
  const clean = input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (!clean) return null;

  // Direct IATA code match (3 letters)
  if (/^[a-z]{3}$/.test(clean) && AIRPORTS[clean]) {
    return AIRPORTS[clean];
  }

  // City alias match
  if (CITY_ALIASES[clean] && AIRPORTS[CITY_ALIASES[clean]!]) {
    return AIRPORTS[CITY_ALIASES[clean]!]!;
  }

  // Partial city name match
  for (const [alias, key] of Object.entries(CITY_ALIASES)) {
    if (alias.startsWith(clean) || clean.startsWith(alias)) {
      if (AIRPORTS[key]) return AIRPORTS[key]!;
    }
  }

  // Partial IATA match
  for (const [key, airport] of Object.entries(AIRPORTS)) {
    if (key.startsWith(clean)) return airport;
  }

  // If input looks like an IATA code, use it directly even if not in list
  if (/^[a-zA-Z]{3}$/.test(input.trim())) {
    return { iata: input.trim().toUpperCase(), name: input.trim().toUpperCase(), city: input.trim().toUpperCase(), country: "" };
  }

  return null;
}

export function suggestAirports(input: string): AirportResult[] {
  const clean = input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (clean.length < 2) return [];

  const results: AirportResult[] = [];
  const seen = new Set<string>();

  const add = (a: AirportResult) => {
    if (!seen.has(a.iata)) { seen.add(a.iata); results.push(a); }
  };

  // Exact alias
  if (CITY_ALIASES[clean] && AIRPORTS[CITY_ALIASES[clean]!]) add(AIRPORTS[CITY_ALIASES[clean]!]!);

  // Partial alias
  for (const [alias, key] of Object.entries(CITY_ALIASES)) {
    if (alias.startsWith(clean) && AIRPORTS[key]) add(AIRPORTS[key]!);
  }

  // IATA starts with
  for (const [key, airport] of Object.entries(AIRPORTS)) {
    if (key.startsWith(clean)) add(airport);
  }

  // City starts with
  for (const airport of Object.values(AIRPORTS)) {
    if (airport.city.toLowerCase().startsWith(clean)) add(airport);
  }

  return results.slice(0, 5);
}
