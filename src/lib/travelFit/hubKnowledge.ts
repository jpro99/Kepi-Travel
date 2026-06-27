/** West-coast hub knowledge for airline fit scoring. */
export interface HubProfile {
  airlineCode: string;
  label: string;
  primaryAirports: string[];
  strengths: string[];
}

export const WEST_COAST_HUBS: HubProfile[] = [
  {
    airlineCode: "AS",
    label: "Alaska Airlines",
    primaryAirports: ["SEA", "LAX", "SNA", "SAN", "PDX", "SFO", "ANC"],
    strengths: [
      "Strong West Coast network and Oneworld partners",
      "Good Japan and Hawaii options from SEA and LAX",
      "MVP status perks on Alaska metal",
    ],
  },
  {
    airlineCode: "UA",
    label: "United Airlines",
    primaryAirports: ["LAX", "SFO", "SEA", "SAN", "DEN"],
    strengths: [
      "Star Alliance hub at SFO and strong LAX presence",
      "Wide international schedule from California gateways",
    ],
  },
  {
    airlineCode: "DL",
    label: "Delta Air Lines",
    primaryAirports: ["LAX", "SEA", "SLC", "PDX"],
    strengths: ["Solid LAX and SEA hubs", "SkyTeam partners for Europe and Asia"],
  },
  {
    airlineCode: "WN",
    label: "Southwest",
    primaryAirports: ["LAX", "OAK", "SJC", "SAN", "LAS", "PHX"],
    strengths: ["Short-haul West Coast hops", "No change fees on domestic"],
  },
  {
    airlineCode: "AA",
    label: "American Airlines",
    primaryAirports: ["LAX", "PHX", "DFW"],
    strengths: ["Oneworld hub at LAX", "Partners overlap with Alaska in some markets"],
  },
];

export const SOCAL_AIRPORTS = new Set(["LAX", "SNA", "ONT", "BUR", "SAN", "LGB", "PSP"]);

export function airlineFromProvider(provider?: string, title?: string): string | null {
  const haystack = `${provider ?? ""} ${title ?? ""}`.toUpperCase();
  const codes = ["AS", "UA", "DL", "AA", "WN", "HA", "B6", "NK", "F9"];
  for (const code of codes) {
    if (haystack.includes(code) || haystack.includes(airlineNameForCode(code))) return code;
  }
  if (/ALASKA/.test(haystack)) return "AS";
  if (/UNITED/.test(haystack)) return "UA";
  if (/DELTA/.test(haystack)) return "DL";
  if (/AMERICAN/.test(haystack)) return "AA";
  if (/SOUTHWEST/.test(haystack)) return "WN";
  if (/HAWAIIAN/.test(haystack)) return "HA";
  if (/JETBLUE/.test(haystack)) return "B6";
  return null;
}

function airlineNameForCode(code: string): string {
  const map: Record<string, string> = {
    AS: "ALASKA",
    UA: "UNITED",
    DL: "DELTA",
    AA: "AMERICAN",
    WN: "SOUTHWEST",
    HA: "HAWAIIAN",
    B6: "JETBLUE",
  };
  return map[code] ?? code;
}

export function hubFitScore(airlineCode: string, homeAirports: string[]): number {
  const hub = WEST_COAST_HUBS.find((h) => h.airlineCode === airlineCode);
  if (!hub) return 20;
  const overlap = homeAirports.filter((a) => hub.primaryAirports.includes(a.toUpperCase())).length;
  if (overlap === 0) return 25;
  if (overlap >= 2) return 95;
  return 70 + overlap * 10;
}

export function isWestCoastHome(homeRegion?: string, homeAirports?: string[]): boolean {
  if (homeRegion?.toLowerCase().includes("california")) return true;
  if (homeRegion?.toLowerCase().includes("west")) return true;
  return (homeAirports ?? []).some((a) => SOCAL_AIRPORTS.has(a.toUpperCase()) || ["SEA", "PDX", "SFO"].includes(a.toUpperCase()));
}
