/**
 * Airport geofence data.
 * Each entry: IATA code → { lat, lon, radiusKm }
 * radiusKm is the rough radius of the airport boundary.
 * "security" radius is the inner zone (past check-in, inside terminal).
 */
export interface AirportGeo {
  iata: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;       // outer boundary — "you are at the airport"
  securityRadiusKm: number; // inner zone — "likely past security / in terminal"
}

// Major airports. Expand as needed.
const AIRPORTS: AirportGeo[] = [
  // North America
  { iata:"LAX", name:"Los Angeles",         lat:33.9425,  lon:-118.4081, radiusKm:4.0, securityRadiusKm:1.5 },
  { iata:"JFK", name:"New York JFK",        lat:40.6413,  lon:-73.7781,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"EWR", name:"Newark",              lat:40.6895,  lon:-74.1745,  radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"ORD", name:"Chicago O'Hare",      lat:41.9742,  lon:-87.9073,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"ATL", name:"Atlanta",             lat:33.6407,  lon:-84.4277,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"DFW", name:"Dallas/Fort Worth",   lat:32.8998,  lon:-97.0403,  radiusKm:5.5, securityRadiusKm:2.0 },
  { iata:"DEN", name:"Denver",              lat:39.8561,  lon:-104.6737, radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"SFO", name:"San Francisco",       lat:37.6213,  lon:-122.379,  radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"SEA", name:"Seattle",             lat:47.4502,  lon:-122.3088, radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"MIA", name:"Miami",               lat:25.7959,  lon:-80.287,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"BOS", name:"Boston",              lat:42.3656,  lon:-71.0096,  radiusKm:3.0, securityRadiusKm:1.0 },
  { iata:"LAS", name:"Las Vegas",           lat:36.0840,  lon:-115.1537, radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"PHX", name:"Phoenix",             lat:33.4373,  lon:-112.0078, radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"IAH", name:"Houston Intercont.",  lat:29.9902,  lon:-95.3368,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"MSP", name:"Minneapolis",         lat:44.8848,  lon:-93.2223,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"DTW", name:"Detroit",             lat:42.2162,  lon:-83.3554,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"PHL", name:"Philadelphia",        lat:39.8744,  lon:-75.2424,  radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"CLT", name:"Charlotte",           lat:35.214,   lon:-80.9431,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"SLC", name:"Salt Lake City",      lat:40.7899,  lon:-111.9791, radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"PDX", name:"Portland",            lat:45.5898,  lon:-122.5951, radiusKm:3.0, securityRadiusKm:1.0 },
  { iata:"MCO", name:"Orlando",             lat:28.4294,  lon:-81.3089,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"IAD", name:"Washington Dulles",   lat:38.9531,  lon:-77.4565,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"BWI", name:"Baltimore/Washington",lat:39.1754,  lon:-76.6683,  radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"SNA", name:"Orange County",       lat:33.6757,  lon:-117.8676, radiusKm:2.5, securityRadiusKm:0.9 },
  { iata:"ONT", name:"Ontario",             lat:34.0560,  lon:-117.6012, radiusKm:3.0, securityRadiusKm:1.0 },
  { iata:"SJC", name:"San Jose",            lat:37.3626,  lon:-121.9290, radiusKm:2.5, securityRadiusKm:0.9 },
  { iata:"HNL", name:"Honolulu",            lat:21.3245,  lon:-157.9251, radiusKm:4.0, securityRadiusKm:1.4 },
  // Canada
  { iata:"YYZ", name:"Toronto Pearson",     lat:43.6777,  lon:-79.6248,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"YVR", name:"Vancouver",           lat:49.1967,  lon:-123.1815, radiusKm:3.5, securityRadiusKm:1.2 },
  // Europe
  { iata:"LHR", name:"London Heathrow",     lat:51.4775,  lon:-0.4614,   radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"LGW", name:"London Gatwick",      lat:51.1537,  lon:-0.1821,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"CDG", name:"Paris CDG",           lat:49.0097,  lon:2.5479,    radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"AMS", name:"Amsterdam",           lat:52.3105,  lon:4.7683,    radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"FRA", name:"Frankfurt",           lat:50.0379,  lon:8.5622,    radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"MUC", name:"Munich",              lat:48.3537,  lon:11.7750,   radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"MAD", name:"Madrid",              lat:40.4936,  lon:-3.5668,   radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"BCN", name:"Barcelona",           lat:41.2971,  lon:2.0785,    radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"FCO", name:"Rome Fiumicino",      lat:41.8003,  lon:12.2389,   radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"VCE", name:"Venice",              lat:45.5053,  lon:12.3519,   radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"MXP", name:"Milan Malpensa",      lat:45.6306,  lon:8.7281,    radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"NAP", name:"Naples",              lat:40.8860,  lon:14.2908,   radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"BRI", name:"Bari",                lat:41.1386,  lon:16.7606,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"FLR", name:"Florence",            lat:43.8100,  lon:11.2051,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"ZRH", name:"Zurich",              lat:47.4647,  lon:8.5492,    radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"ZUR", name:"Zurich",              lat:47.4647,  lon:8.5492,    radiusKm:3.5, securityRadiusKm:1.2 }, // alias — correct IATA is ZRH
  { iata:"VIE", name:"Vienna",              lat:48.1103,  lon:16.5697,   radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"CPH", name:"Copenhagen",          lat:55.6180,  lon:12.6561,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"ARN", name:"Stockholm Arlanda",   lat:59.6519,  lon:17.9186,   radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"DUB", name:"Dublin",              lat:53.4213,  lon:-6.2701,   radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"IST", name:"Istanbul",            lat:41.2753,  lon:28.7519,   radiusKm:6.0, securityRadiusKm:2.0 },
  // Asia-Pacific
  { iata:"NRT", name:"Tokyo Narita",        lat:35.7720,  lon:140.3929,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"HND", name:"Tokyo Haneda",        lat:35.5494,  lon:139.7798,  radiusKm:3.5, securityRadiusKm:1.2 },
  { iata:"ICN", name:"Seoul Incheon",       lat:37.4602,  lon:126.4407,  radiusKm:5.5, securityRadiusKm:2.0 },
  { iata:"PVG", name:"Shanghai Pudong",     lat:31.1443,  lon:121.8083,  radiusKm:5.5, securityRadiusKm:2.0 },
  { iata:"PEK", name:"Beijing Capital",     lat:40.0799,  lon:116.6031,  radiusKm:5.5, securityRadiusKm:2.0 },
  { iata:"HKG", name:"Hong Kong",           lat:22.3080,  lon:113.9185,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"SIN", name:"Singapore Changi",    lat:1.3644,   lon:103.9915,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"CGK", name:"Jakarta Soekarno-Hatta", lat:-6.1256, lon:106.6558, radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"DPS", name:"Denpasar Bali",       lat:-8.7482,  lon:115.1672,  radiusKm:4.0, securityRadiusKm:1.4 },
  { iata:"BKK", name:"Bangkok Suvarnabhumi",lat:13.6900,  lon:100.7501,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"KUL", name:"Kuala Lumpur",        lat:2.7456,   lon:101.7099,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"SYD", name:"Sydney",              lat:-33.9399, lon:151.1753,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"MEL", name:"Melbourne",           lat:-37.6690, lon:144.8410,  radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"DXB", name:"Dubai",               lat:25.2532,  lon:55.3657,   radiusKm:7.0, securityRadiusKm:2.5 },
  { iata:"DOH", name:"Doha Hamad",          lat:25.2609,  lon:51.6138,   radiusKm:5.5, securityRadiusKm:2.0 },
  { iata:"AUH", name:"Abu Dhabi",           lat:24.4330,  lon:54.6511,   radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"BOM", name:"Mumbai",              lat:19.0896,  lon:72.8656,   radiusKm:4.5, securityRadiusKm:1.5 },
  { iata:"DEL", name:"Delhi",               lat:28.5562,  lon:77.1000,   radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"GRU", name:"São Paulo",           lat:-23.4356, lon:-46.4731,  radiusKm:5.0, securityRadiusKm:1.8 },
  { iata:"GIG", name:"Rio de Janeiro",      lat:-22.8099, lon:-43.2505,  radiusKm:4.5, securityRadiusKm:1.5 },
];

const AIRPORT_MAP = new Map(AIRPORTS.map(a => [a.iata, a]));

export function getAirportByIata(iata: string | undefined | null): AirportGeo | undefined {
  const code = iata?.trim().toUpperCase();
  if (!code) return undefined;
  return AIRPORT_MAP.get(code);
}

/** Haversine distance in km between two lat/lon points */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export type UserAirportStatus =
  | "away"           // not at the airport
  | "at-airport"     // within outer boundary (check-in zone)
  | "in-terminal"    // within inner boundary (past security / airside)
  | "unknown";       // no GPS

export interface AirportProximity {
  status: UserAirportStatus;
  airport: AirportGeo | null;
  distanceKm: number | null;
}

export function getAirportProximity(
  userLat: number | null,
  userLon: number | null,
  departureIata: string | undefined,
): AirportProximity {
  if (userLat === null || userLon === null) {
    return { status: "unknown", airport: null, distanceKm: null };
  }

  // When a departure airport is known, only geofence THAT field (never a nearby wrong airport).
  if (departureIata?.trim()) {
    const apt = AIRPORT_MAP.get(departureIata.trim().toUpperCase());
    if (!apt) {
      return { status: "away", airport: null, distanceKm: null };
    }
    const d = distanceKm(userLat, userLon, apt.lat, apt.lon);
    if (d > apt.radiusKm) {
      return { status: "away", airport: apt, distanceKm: d };
    }
    return {
      status: d <= apt.securityRadiusKm ? "in-terminal" : "at-airport",
      airport: apt,
      distanceKm: d,
    };
  }

  let closest: AirportGeo | null = null;
  let closestDist = Infinity;

  for (const apt of AIRPORTS) {
    const d = distanceKm(userLat, userLon, apt.lat, apt.lon);
    if (d < closestDist) {
      closestDist = d;
      closest = apt;
    }
  }

  if (!closest || closestDist > closest.radiusKm) {
    return { status: "away", airport: closest, distanceKm: closestDist };
  }

  const status: UserAirportStatus = closestDist <= closest.securityRadiusKm
    ? "in-terminal"
    : "at-airport";

  return { status, airport: closest, distanceKm: closestDist };
}
