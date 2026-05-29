/**
 * Airport terminal/concourse routing knowledge base.
 *
 * This encodes how to get from one part of an airport to another —
 * trains, shuttles, walkways, inter-terminal buses — with realistic
 * walking time estimates and named landmarks.
 *
 * Used by AirportMode to generate step-by-step airport guidance.
 */

export type TransportMode =
  | "walk"
  | "train"        // automated people mover / APM
  | "shuttle"      // landside bus between terminals
  | "tram"         // airside tram / monorail
  | "escalator";

export interface NavStep {
  instruction: string;    // e.g. "Take the N Concourse train from the main terminal"
  detail?: string;        // e.g. "Runs every 2-3 min, takes 2 min"
  mode: TransportMode;
  estimatedMinutes: number;
  landmark?: string;      // e.g. "Look for the blue 'N Gates' signs after security"
}

export interface ConcourseRoute {
  fromZone: string;       // e.g. "security" | "C" | "T1" | "landside"
  toZone: string;         // e.g. "N" | "gate:B12" | "lounge"
  steps: NavStep[];
  totalMinutes: number;
}

export interface AirportNavigation {
  iata: string;
  name: string;
  securityNotes: NavStep[];         // what happens right after you clear security
  concourseRoutes: ConcourseRoute[];
  generalNotes?: string;
}

const AIRPORT_NAV: AirportNavigation[] = [
  // ── Seattle SEA ──────────────────────────────────────────────
  {
    iata: "SEA",
    name: "Seattle-Tacoma",
    securityNotes: [
      { instruction: "After security, you're in the main concourse (A/B/C gates)", mode: "walk", estimatedMinutes: 0, landmark: "Follow signs — C gates are straight ahead, A gates to the left" },
    ],
    concourseRoutes: [
      {
        fromZone: "security", toZone: "C",
        steps: [{ instruction: "Walk straight past security — C gates are directly ahead", mode: "walk", estimatedMinutes: 3, landmark: "C gates start at C1 on your right" }],
        totalMinutes: 3,
      },
      {
        fromZone: "security", toZone: "N",
        steps: [
          { instruction: "Follow 'N Gates / North Satellite' signs from the main concourse", mode: "walk", estimatedMinutes: 2 },
          { instruction: "Take the underground N Concourse train", detail: "Runs every 2–3 min, 2-min ride. Board at the far end of Concourse C", mode: "train", estimatedMinutes: 4, landmark: "Look for the red 'N Gates' train sign near Gate C18" },
          { instruction: "Exit the train and follow signs to your gate", mode: "walk", estimatedMinutes: 2 },
        ],
        totalMinutes: 8,
      },
      {
        fromZone: "N", toZone: "C",
        steps: [
          { instruction: "Take the N Concourse train back toward main terminal", mode: "train", estimatedMinutes: 4 },
          { instruction: "Follow signs to C gates", mode: "walk", estimatedMinutes: 2 },
        ],
        totalMinutes: 6,
      },
    ],
    generalNotes: "SEA has two main areas: the main terminal (A/B/C gates) and the North Satellite (N gates). They're connected by an underground train.",
  },

  // ── Atlanta ATL ──────────────────────────────────────────────
  {
    iata: "ATL",
    name: "Atlanta Hartsfield-Jackson",
    securityNotes: [
      { instruction: "After security you're at the domestic terminal (T). Concourses A–F are connected by an underground train or a long walk", mode: "walk", estimatedMinutes: 0, landmark: "Train entrance is at the center of the T concourse level" },
    ],
    concourseRoutes: [
      {
        fromZone: "T", toZone: "A",
        steps: [
          { instruction: "Take the Plane Train from the Domestic Terminal", detail: "Runs continuously, no schedule needed. T → A is 2 stops", mode: "train", estimatedMinutes: 5, landmark: "Follow 'Plane Train' signs downstairs from security" },
        ],
        totalMinutes: 5,
      },
      {
        fromZone: "T", toZone: "B",
        steps: [{ instruction: "Take the Plane Train — B is 3 stops from T", mode: "train", estimatedMinutes: 6 }],
        totalMinutes: 6,
      },
      {
        fromZone: "T", toZone: "C",
        steps: [{ instruction: "Take the Plane Train — C is 4 stops from T", mode: "train", estimatedMinutes: 7 }],
        totalMinutes: 7,
      },
      {
        fromZone: "T", toZone: "D",
        steps: [{ instruction: "Take the Plane Train — D is 5 stops from T", mode: "train", estimatedMinutes: 8 }],
        totalMinutes: 8,
      },
      {
        fromZone: "T", toZone: "E",
        steps: [{ instruction: "Take the Plane Train — E is 6 stops from T (international)", mode: "train", estimatedMinutes: 10 }],
        totalMinutes: 10,
      },
      {
        fromZone: "T", toZone: "F",
        steps: [{ instruction: "Take the Plane Train — F is 7 stops from T (international)", mode: "train", estimatedMinutes: 12 }],
        totalMinutes: 12,
      },
    ],
    generalNotes: "ATL is the world's busiest airport. All concourses (A–F) connect to the Domestic Terminal via the underground Plane Train. Allow extra time — the train runs constantly but it's a long ride to F.",
  },

  // ── Chicago O'Hare ORD ───────────────────────────────────────
  {
    iata: "ORD",
    name: "Chicago O'Hare",
    securityNotes: [
      { instruction: "After security, check your gate terminal — T1 (B/C), T2 (E/F), T3 (G/H/K), T5 (international)", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T2",
        steps: [
          { instruction: "Take the ATS (Airport Transit System) from T1", detail: "Free, runs every 3–5 min. T1 → T2 is 1 stop", mode: "train", estimatedMinutes: 5, landmark: "ATS station is between B and C concourses in T1" },
        ],
        totalMinutes: 5,
      },
      {
        fromZone: "T1", toZone: "T3",
        steps: [
          { instruction: "Take the ATS from T1 — T3 is 2 stops", mode: "train", estimatedMinutes: 7 },
        ],
        totalMinutes: 7,
      },
      {
        fromZone: "T3", toZone: "T5",
        steps: [
          { instruction: "Take the ATS from T3 toward T5 (international)", detail: "T5 is a separate stop — allow extra time", mode: "train", estimatedMinutes: 10, landmark: "T5 is the international terminal, follow blue signs" },
        ],
        totalMinutes: 10,
      },
      {
        fromZone: "T1", toZone: "T5",
        steps: [
          { instruction: "Take the ATS from T1 all the way to T5 (international) — 3 stops", mode: "train", estimatedMinutes: 12 },
        ],
        totalMinutes: 12,
      },
    ],
    generalNotes: "ORD has 4 terminals connected by the free ATS train. T1/2/3 are domestic; T5 is international. The ATS runs 24/7.",
  },

  // ── Dallas/Fort Worth DFW ────────────────────────────────────
  {
    iata: "DFW",
    name: "Dallas/Fort Worth",
    securityNotes: [
      { instruction: "After security check which terminal you're in (A, B, C, D, or E) — your gate letter matches your terminal", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "A", toZone: "B",
        steps: [{ instruction: "Take the Skylink train from Terminal A — runs along the airport perimeter", detail: "Free, runs every 2–4 min", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "A", toZone: "C",
        steps: [{ instruction: "Take the Skylink train from A to C — 2 stops", mode: "train", estimatedMinutes: 7 }],
        totalMinutes: 7,
      },
      {
        fromZone: "A", toZone: "D",
        steps: [{ instruction: "Take the Skylink from A to D — 3 stops, crosses the center", mode: "train", estimatedMinutes: 10 }],
        totalMinutes: 10,
      },
      {
        fromZone: "A", toZone: "E",
        steps: [{ instruction: "Take the Skylink from A to E — 4 stops (international/American)", mode: "train", estimatedMinutes: 12 }],
        totalMinutes: 12,
      },
    ],
    generalNotes: "DFW has 5 terminals arranged in a horseshoe, connected by the free Skylink elevated train. Gates are labeled by terminal (A1–A40, B1–B40, etc.).",
  },

  // ── Los Angeles LAX ──────────────────────────────────────────
  {
    iata: "LAX",
    name: "Los Angeles",
    securityNotes: [
      { instruction: "LAX has 9 terminals in a horseshoe. Check your terminal — walking between adjacent terminals is possible airside, but non-adjacent requires exiting and re-entering security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T2",
        steps: [{ instruction: "Walk airside from T1 to T2 — connected via indoor walkway", mode: "walk", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T4", toZone: "T5",
        steps: [{ instruction: "Walk airside from T4 to T5 — connected via jetway level bridge", mode: "walk", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T4", toZone: "T6",
        steps: [
          { instruction: "Take the LAX automated people mover (opens 2024) or walk landside", mode: "walk", estimatedMinutes: 10, detail: "The new APM connects all terminals — follow signs for 'inter-terminal' connections" },
        ],
        totalMinutes: 10,
      },
      {
        fromZone: "TBIT", toZone: "T4",
        steps: [{ instruction: "Walk airside from Tom Bradley International Terminal (TBIT) to T4 via the connector", mode: "walk", estimatedMinutes: 7, landmark: "Follow 'T4 Connector' signs from TBIT departure level" }],
        totalMinutes: 7,
      },
    ],
    generalNotes: "LAX terminals are arranged in a horseshoe. T1-T7 are domestic; TBIT (Tom Bradley) is international. Some adjacent terminals connect airside; others require landside transfer.",
  },

  // ── Denver DEN ───────────────────────────────────────────────
  {
    iata: "DEN",
    name: "Denver International",
    securityNotes: [
      { instruction: "After security, take the underground train to your concourse — A, B, or C", mode: "train", estimatedMinutes: 0, landmark: "Train entrance is straight ahead after the main security checkpoint" },
    ],
    concourseRoutes: [
      {
        fromZone: "security", toZone: "A",
        steps: [{ instruction: "Take the train from the main terminal — Concourse A is the first stop", detail: "Runs every 2 min", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "security", toZone: "B",
        steps: [{ instruction: "Take the train to Concourse B — second stop, center of the airport", mode: "train", estimatedMinutes: 6 }],
        totalMinutes: 6,
      },
      {
        fromZone: "security", toZone: "C",
        steps: [{ instruction: "Take the train to Concourse C — third stop (United gates)", mode: "train", estimatedMinutes: 8 }],
        totalMinutes: 8,
      },
      {
        fromZone: "B", toZone: "A",
        steps: [{ instruction: "Take the train back one stop toward the main terminal, exit at A", mode: "train", estimatedMinutes: 4 }],
        totalMinutes: 4,
      },
    ],
    generalNotes: "DEN's main terminal is connected to 3 concourses (A, B, C) via an underground train. You cannot walk between them — the train is mandatory.",
  },

  // ── San Francisco SFO ────────────────────────────────────────
  {
    iata: "SFO",
    name: "San Francisco",
    securityNotes: [
      { instruction: "SFO has 4 terminals in a loop: T1, T2, T3, and International (ITB). Check your boarding area (A–G)", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T2",
        steps: [{ instruction: "Walk airside from T1 (B gates) to T2 (D gates) — directly connected", mode: "walk", estimatedMinutes: 6 }],
        totalMinutes: 6,
      },
      {
        fromZone: "T2", toZone: "T3",
        steps: [{ instruction: "Walk airside from T2 to T3 (E/F gates) — connected via departure level walkway", mode: "walk", estimatedMinutes: 8 }],
        totalMinutes: 8,
      },
      {
        fromZone: "T3", toZone: "ITB",
        steps: [
          { instruction: "Take the AirTrain from T3 to the International Terminal", detail: "Free, runs every 5 min", mode: "train", estimatedMinutes: 6, landmark: "AirTrain station is on the departures level of T3" },
        ],
        totalMinutes: 6,
      },
      {
        fromZone: "T1", toZone: "ITB",
        steps: [
          { instruction: "Take the AirTrain from T1 all the way to International Terminal", mode: "train", estimatedMinutes: 12 },
        ],
        totalMinutes: 12,
      },
    ],
    generalNotes: "SFO terminals form a loop. T1/T2/T3 are domestic and connect airside. The International Terminal (A and G gates) requires the AirTrain.",
  },

  // ── New York JFK ─────────────────────────────────────────────
  {
    iata: "JFK",
    name: "New York JFK",
    securityNotes: [
      { instruction: "JFK has separate terminals (T1, T2, T4, T5, T7, T8) — most are NOT connected airside. Check you're in the right terminal before security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T4", toZone: "T2",
        steps: [
          { instruction: "Take the AirTrain from T4 to T2", detail: "Free between terminals, runs every 5–10 min", mode: "train", estimatedMinutes: 8 },
        ],
        totalMinutes: 8,
      },
      {
        fromZone: "T5", toZone: "T4",
        steps: [{ instruction: "Take the AirTrain from T5 (JetBlue) to T4 — 1 stop", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T7", toZone: "T4",
        steps: [{ instruction: "Take the AirTrain from T7 (Alaska) to T4 — 2 stops", mode: "train", estimatedMinutes: 8 }],
        totalMinutes: 8,
      },
      {
        fromZone: "T8", toZone: "T4",
        steps: [{ instruction: "Take the AirTrain from T8 (American) to T4 — 2 stops via Lefferts or Howard Beach loop", mode: "train", estimatedMinutes: 10 }],
        totalMinutes: 10,
      },
    ],
    generalNotes: "JFK terminals are mostly separate buildings — inter-terminal transfers require going landside and taking the AirTrain. Never miss your terminal at JFK.",
  },

  // ── Houston IAH ─────────────────────────────────────────────
  {
    iata: "IAH",
    name: "Houston Intercontinental",
    securityNotes: [
      { instruction: "IAH has 5 terminals (A–E) connected by the Skyway underground train", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "A", toZone: "B",
        steps: [{ instruction: "Take the Skyway train from Terminal A to B — 1 stop", detail: "Runs every 3 min", mode: "train", estimatedMinutes: 4 }],
        totalMinutes: 4,
      },
      {
        fromZone: "A", toZone: "C",
        steps: [{ instruction: "Take the Skyway from A to C — 2 stops", mode: "train", estimatedMinutes: 6 }],
        totalMinutes: 6,
      },
      {
        fromZone: "C", toZone: "D",
        steps: [{ instruction: "Walk from C to D — connected by an enclosed bridge (no train needed)", mode: "walk", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "A", toZone: "E",
        steps: [{ instruction: "Take the Skyway all the way to Terminal E (international) — 4 stops", mode: "train", estimatedMinutes: 12 }],
        totalMinutes: 12,
      },
    ],
    generalNotes: "IAH terminals A–E are connected by the underground Skyway train. C and D also have an airside walkway. United dominates this airport.",
  },

  // ── Minneapolis MSP ──────────────────────────────────────────
  {
    iata: "MSP",
    name: "Minneapolis-St. Paul",
    securityNotes: [
      { instruction: "MSP has two terminals: T1 (Lindbergh, most airlines) and T2 (Humphrey, mostly Sun Country/Spirit). Check which terminal before arriving", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1-security", toZone: "C",
        steps: [{ instruction: "From T1 security, walk straight ahead — C concourse (Delta) is directly connected", mode: "walk", estimatedMinutes: 3 }],
        totalMinutes: 3,
      },
      {
        fromZone: "T1-security", toZone: "F",
        steps: [
          { instruction: "From T1 security, walk toward the tram station", mode: "walk", estimatedMinutes: 3 },
          { instruction: "Take the underground tram to Concourse F (Delta international / Sun Country)", detail: "Runs every 5 min", mode: "tram", estimatedMinutes: 5 },
        ],
        totalMinutes: 8,
      },
      {
        fromZone: "T1", toZone: "T2",
        steps: [
          { instruction: "Take the free tram between T1 and T2 (Humphrey Terminal)", detail: "Runs every 5–10 min, 12 min ride", mode: "tram", estimatedMinutes: 12, landmark: "Tram station is on the ground floor of T1 near baggage claim" },
        ],
        totalMinutes: 12,
      },
    ],
    generalNotes: "MSP T1 (Lindbergh) has concourses C, D, F, and G. Most Delta flights use C, D, and G. International flights use F. T2 is a separate terminal for budget carriers.",
  },

  // ── Tokyo Haneda HND ─────────────────────────────────────────
  {
    iata: "HND",
    name: "Tokyo Haneda",
    securityNotes: [
      { instruction: "Haneda has 3 terminals: T1 (JAL domestic), T2 (ANA domestic), T3 (international). For international flights you want T3", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T3",
        steps: [
          { instruction: "Take the connecting bus or walk via the 3F connecting corridor to T3", detail: "Free shuttle bus runs every 5 min between domestic and international terminals", mode: "shuttle", estimatedMinutes: 10 },
        ],
        totalMinutes: 10,
      },
      {
        fromZone: "T2", toZone: "T3",
        steps: [{ instruction: "Take the free shuttle bus from T2 to T3 international", mode: "shuttle", estimatedMinutes: 10 }],
        totalMinutes: 10,
      },
    ],
    generalNotes: "Haneda T3 is the international terminal — separate from the domestic T1 and T2. Allow extra time if connecting from a domestic flight.",
  },

  // ── Singapore Changi SIN ─────────────────────────────────────
  {
    iata: "SIN",
    name: "Singapore Changi",
    securityNotes: [
      { instruction: "Changi has 4 terminals (T1–T4) plus Jewel Changi. T1/T2/T3 connect airside by Skytrain. T4 requires a bus", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T2",
        steps: [{ instruction: "Take the free Skytrain from T1 to T2 — 1 stop, 5 min", detail: "Runs every 3 min, 24/7", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T2", toZone: "T3",
        steps: [{ instruction: "Take the Skytrain from T2 to T3 — 1 stop", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T3", toZone: "T4",
        steps: [
          { instruction: "Take the free inter-terminal bus from T3 to T4", detail: "Bus runs every 10 min from basement of T3. T4 requires separate security check", mode: "shuttle", estimatedMinutes: 15, landmark: "Bus stop is at basement level B2 of T3" },
        ],
        totalMinutes: 15,
      },
    ],
    generalNotes: "Changi is consistently voted the world's best airport. T1/T2/T3 are airside connected by Skytrain. T4 uses a separate bus shuttle and has its own security.",
  },

  // ── Dubai DXB ────────────────────────────────────────────────
  {
    iata: "DXB",
    name: "Dubai International",
    securityNotes: [
      { instruction: "DXB has 3 terminals: T1 (most international), T2 (flydubai), T3 (Emirates only — connected to T1 airside)", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T1", toZone: "T3",
        steps: [
          { instruction: "Take the free airside metro from T1 to T3 (Emirates terminal)", detail: "Runs continuously, no schedule. Takes 5 min", mode: "train", estimatedMinutes: 5, landmark: "Metro entrance is in the departure level of T1" },
        ],
        totalMinutes: 5,
      },
      {
        fromZone: "T3", toZone: "T1",
        steps: [{ instruction: "Take the airside metro from T3 back to T1", mode: "train", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "T1", toZone: "T2",
        steps: [
          { instruction: "T2 is landside-only — exit T1, take the free inter-terminal bus", mode: "shuttle", estimatedMinutes: 20 },
        ],
        totalMinutes: 20,
      },
    ],
    generalNotes: "DXB T3 is exclusively Emirates and is one of the world's largest terminals. T1 and T3 connect by airside metro. T2 is separate and requires landside transfer.",
  },

  // ── London Heathrow LHR ──────────────────────────────────────
  {
    iata: "LHR",
    name: "London Heathrow",
    securityNotes: [
      { instruction: "LHR has 4 terminals: T2 (Star Alliance), T3 (oneworld international), T4 (some BA/oneworld), T5 (British Airways). Check your terminal carefully — they are far apart", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T2", toZone: "T3",
        steps: [{ instruction: "Walk airside from T2 to T3 — connected via Queens Terminal walkway", mode: "walk", estimatedMinutes: 8, landmark: "Follow 'T3 / Satellite' signs from T2 departures" }],
        totalMinutes: 8,
      },
      {
        fromZone: "T2", toZone: "T5",
        steps: [
          { instruction: "Take the free Heathrow Express or Heathrow Connect between terminals — or the free inter-terminal bus", detail: "Bus H1/H2 runs every 15 min, free for connecting passengers", mode: "shuttle", estimatedMinutes: 20, landmark: "Bus stop is outside T2 arrivals level" },
        ],
        totalMinutes: 20,
      },
      {
        fromZone: "T5", toZone: "T2",
        steps: [{ instruction: "Take the free inter-terminal bus from T5 to T2", mode: "shuttle", estimatedMinutes: 20 }],
        totalMinutes: 20,
      },
      {
        fromZone: "T5", toZone: "T5B",
        steps: [{ instruction: "Take the T5 internal pod from T5 main to T5B satellite", detail: "Runs continuously, 2-min ride", mode: "tram", estimatedMinutes: 3, landmark: "Pod entrance past security in T5 main building" }],
        totalMinutes: 3,
      },
    ],
    generalNotes: "LHR is large and complex. T2 and T3 share a terminal zone. T5 is BA's home and has satellites T5B and T5C connected by internal pods. Allow 20+ min for inter-terminal transfers.",
  },
];

const NAV_MAP = new Map(AIRPORT_NAV.map(n => [n.iata, n]));

export function getAirportNav(iata: string): AirportNavigation | null {
  return NAV_MAP.get(iata.toUpperCase()) ?? null;
}

/**
 * Determine which route to use given departure gate and known current zone.
 * Returns the best matching ConcourseRoute or null if no specific routing needed.
 */
export function getRouteToGate(
  nav: AirportNavigation,
  fromZone: string,
  gateOrTerminal: string,
): ConcourseRoute | null {
  // Extract gate letter/concourse from gate number (e.g. "C14" → "C", "N6" → "N", "B22" → "B")
  const gatePrefix = gateOrTerminal.match(/^([A-Z]+)/)?.[1] ?? gateOrTerminal;

  // Look for exact toZone match first
  const exact = nav.concourseRoutes.find(r =>
    r.fromZone.toUpperCase() === fromZone.toUpperCase() &&
    (r.toZone.toUpperCase() === gatePrefix.toUpperCase() ||
     r.toZone.toUpperCase() === gateOrTerminal.toUpperCase())
  );
  if (exact) return exact;

  // Try fromZone as "security" fallback
  const fromSecurity = nav.concourseRoutes.find(r =>
    r.fromZone.toLowerCase() === "security" &&
    (r.toZone.toUpperCase() === gatePrefix.toUpperCase() ||
     r.toZone.toUpperCase() === gateOrTerminal.toUpperCase())
  );
  return fromSecurity ?? null;
}

/**
 * Generate natural language step-by-step instructions from security to gate.
 * Returns an array of instruction strings ready to display.
 */
export function buildGateInstructions(
  iata: string,
  gate: string | undefined,
  terminal: string | undefined,
  hasClear: boolean,
  hasPrecheck: boolean,
  hasGlobalEntry: boolean,
): { steps: { icon: string; text: string; detail?: string; minutes: number }[]; totalMinutes: number } {
  const nav = getAirportNav(iata);
  const steps: { icon: string; text: string; detail?: string; minutes: number }[] = [];
  let totalMinutes = 0;

  // Step 1: Security
  const secIcon = hasClear ? "⚡" : hasPrecheck || hasGlobalEntry ? "✅" : "🛡";
  const secText = hasClear
    ? "CLEAR lane — biometric scan, then TSA PreCheck belt (fastest)"
    : hasGlobalEntry
    ? "Global Entry PreCheck lane — no laptop/liquids out, dedicated line"
    : hasPrecheck
    ? "TSA PreCheck lane — no removing shoes or laptop, dedicated queue"
    : "Standard TSA security — remove shoes, laptop, and liquids";
  const secMin = hasClear ? 5 : hasPrecheck || hasGlobalEntry ? 8 : 20;
  steps.push({ icon: secIcon, text: secText, minutes: secMin });
  totalMinutes += secMin;

  if (!nav) {
    // Generic fallback
    if (gate) {
      steps.push({ icon: "🚪", text: `Head to Gate ${gate}${terminal ? ` in Terminal ${terminal}` : ""}`, detail: "Follow overhead gate signs", minutes: 10 });
      totalMinutes += 10;
    }
    return { steps, totalMinutes };
  }

  // Step 2: Security notes from the airport
  nav.securityNotes.forEach(note => {
    if (note.estimatedMinutes > 0 || note.landmark) {
      steps.push({ icon: "ℹ️", text: note.instruction, detail: note.landmark, minutes: note.estimatedMinutes });
      totalMinutes += note.estimatedMinutes;
    }
  });

  // Step 3: Route to gate's concourse/terminal
  const gateZone = gate?.match(/^([A-Z]+)/)?.[1];
  const route = gate ? getRouteToGate(nav, "security", gate) : null;

  if (route) {
    route.steps.forEach(step => {
      const icon = step.mode === "train" ? "🚇"
        : step.mode === "tram" ? "🚃"
        : step.mode === "shuttle" ? "🚌"
        : "🚶";
      steps.push({ icon, text: step.instruction, detail: step.detail ?? step.landmark, minutes: step.estimatedMinutes });
      totalMinutes += step.estimatedMinutes;
    });
  }

  // Step 4: Final gate
  if (gate) {
    const gateText = gateZone && gateZone !== gate
      ? `Find Gate ${gate} — it's in the ${gateZone} concourse`
      : `Find Gate ${gate}`;
    steps.push({ icon: "🚪", text: gateText, detail: "Check gate boards for any last-minute changes", minutes: 3 });
    totalMinutes += 3;
  }

  return { steps, totalMinutes };
}
