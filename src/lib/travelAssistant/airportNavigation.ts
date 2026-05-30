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

export interface BaggageCarousel {
  terminal?: string;
  carouselNote: string;          // e.g. "Carousel 2 — follow signs from gate level down one floor"
  walkMinutes: number;           // gate to carousel
  tips?: string[];
}

export interface ArrivalInfo {
  baggageCarousels: BaggageCarousel[];
  exitDirections: string;        // "Follow green 'Exit/Ground Transport' signs past carousel"
  groundTransport?: string;      // rideshare, taxi, shuttle info
  connectingFlight?: string;     // if this is a connection hub, how to re-enter security
  customsTip?: string;           // international arrivals only
  generalTip?: string;
}

export interface AirportNavigation {
  iata: string;
  name: string;
  securityNotes: NavStep[];
  concourseRoutes: ConcourseRoute[];
  arrivalInfo?: ArrivalInfo;     // what to do AFTER landing
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
  // ── Portland PDX ─────────────────────────────────────────────
  {
    iata: "PDX",
    name: "Portland International",
    securityNotes: [
      { instruction: "PDX is a single terminal with concourses A–E all connected airside — no train needed", mode: "walk", estimatedMinutes: 0, landmark: "After security turn right for A/B gates, left for C/D/E gates" },
    ],
    concourseRoutes: [
      {
        fromZone: "security", toZone: "A",
        steps: [{ instruction: "Turn right after security — A gates are closest, starting at A1", mode: "walk", estimatedMinutes: 4, landmark: "Alaska and Southwest use A concourse" }],
        totalMinutes: 4,
      },
      {
        fromZone: "security", toZone: "B",
        steps: [{ instruction: "Walk straight ahead from security — B gates are center concourse", mode: "walk", estimatedMinutes: 5 }],
        totalMinutes: 5,
      },
      {
        fromZone: "security", toZone: "C",
        steps: [{ instruction: "Turn left after security and walk to C gates", mode: "walk", estimatedMinutes: 7, landmark: "United and Delta use C/D concourse" }],
        totalMinutes: 7,
      },
      {
        fromZone: "security", toZone: "D",
        steps: [{ instruction: "Turn left after security, walk past C gates to D concourse", mode: "walk", estimatedMinutes: 9 }],
        totalMinutes: 9,
      },
      {
        fromZone: "security", toZone: "E",
        steps: [{ instruction: "E is the farthest concourse — turn left and walk all the way to the end", mode: "walk", estimatedMinutes: 12, landmark: "E gates are international departures" }],
        totalMinutes: 12,
      },
    ],
    generalNotes: "PDX is one of the easiest US airports — single terminal, all gates connected airside, no trains. MAX light rail connects downtown to the airport.",
  },

  // ── San Francisco SFO (detailed) ─────────────────────────────
  // Already in the list above — SFO is covered

  // ── Los Angeles LAX (detailed) ───────────────────────────────
  // Already in the list above — LAX is covered

  // ── Ontario ONT ──────────────────────────────────────────────
  {
    iata: "ONT",
    name: "Ontario International",
    securityNotes: [
      { instruction: "ONT has two small terminals — T2 is the main terminal for most flights, T4 is for some airlines", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "T2-security", toZone: "T2",
        steps: [{ instruction: "After security in T2 all gates are immediately ahead — small airport, nothing more than a 3-min walk", mode: "walk", estimatedMinutes: 3 }],
        totalMinutes: 3,
      },
      {
        fromZone: "T4-security", toZone: "T4",
        steps: [{ instruction: "After T4 security all gates are directly ahead", mode: "walk", estimatedMinutes: 3 }],
        totalMinutes: 3,
      },
      {
        fromZone: "T2", toZone: "T4",
        steps: [
          { instruction: "Exit T2 to the roadway and walk or take the free shuttle to T4", mode: "shuttle", estimatedMinutes: 8, landmark: "Shuttle stop is outside the T2 arrivals exit" },
        ],
        totalMinutes: 8,
      },
    ],
    arrivalInfo: {
      baggageCarousels: [
        {
          terminal: "T2",
          carouselNote: "Baggage claim is on the ground floor — exit your gate, walk straight through the terminal, take the escalator or stairs DOWN one level. Carousels are immediately at the bottom. Alaska Airlines typically uses Carousel 1 or 2.",
          walkMinutes: 5,
          tips: [
            "ONT baggage claim is one of the fastest in California — bags typically arrive 10–15 min after touchdown",
            "Carousel number will be on the arrivals screen near the escalator",
            "If bags are delayed, the Alaska counter is upstairs at check-in level",
          ],
        },
        {
          terminal: "T4",
          carouselNote: "T4 baggage claim is on the ground floor, directly below the gate level. Follow signs for 'Baggage Claim' from the gate area.",
          walkMinutes: 5,
          tips: ["T4 is smaller — only 2 carousels total"],
        },
      ],
      exitDirections: "After grabbing bags, follow the green 'Exit / Ground Transportation' signs through the glass doors to the curb. Rideshare (Uber/Lyft) pickup is at the outer curb — follow the signs on the pillars for 'App-Based Rides'. Taxis are at the inner curb. Short-term parking and cell phone lot are a 2-min walk across the roadway.",
      groundTransport: "Rideshare (Uber/Lyft): Exit baggage claim through the glass doors, turn RIGHT, follow 'App-Based Transportation' signs to the designated pickup zone on the outer lane. Taxis: available at the taxi stand on the inner curb immediately outside baggage claim. Rental cars: Take the shuttle from outside baggage claim — Hertz, Avis, Enterprise, Budget, and National are all at the rental car facility a 5-min shuttle ride away. The shuttle stop is marked with orange signs outside the exit.",
      generalTip: "ONT is tiny and easy — you can be in a car within 20 minutes of landing. No trains, no trams, no complicated transfers. Just walk straight down to baggage and out.",
    },
    generalNotes: "ONT is a small, easy airport. Most Alaska, Southwest, American, and Delta flights use T2. T4 is used by some other carriers. Very short walks to all gates.",
  },

  // ════════════════════════════════════════════════════════════
  //  TIER 2 — US DOMESTIC
  // ════════════════════════════════════════════════════════════

  // ── Honolulu HNL ─────────────────────────────────────────────
  {
    iata: "HNL",
    name: "Daniel K. Inouye International (Honolulu)",
    securityNotes: [
      { instruction: "HNL has the Overseas Terminal (inter-island and mainland) and the Commuter Terminal. For mainland US flights use the Overseas Terminal.", mode: "walk", estimatedMinutes: 0 },
      { instruction: "After security follow the gate letter signs — Gates 1–22 are in the main concourse, Gates 50+ are the inter-island gates", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      {
        fromZone: "security", toZone: "A",
        steps: [{ instruction: "Gates A1–A8: turn left after security and walk to the A concourse", mode: "walk", estimatedMinutes: 4 }],
        totalMinutes: 4,
      },
      {
        fromZone: "security", toZone: "B",
        steps: [{ instruction: "Gates B1–B12: walk straight through the terminal to the B concourse", mode: "walk", estimatedMinutes: 6 }],
        totalMinutes: 6,
      },
    ],
    arrivalInfo: {
      baggageCarousels: [
        {
          terminal: "Overseas Terminal",
          carouselNote: "After deplaning, follow 'Baggage Claim' signs DOWN the escalators to street level. Carousels are numbered — your carousel will be on the arrivals board near the bottom of the escalator. Alaska Airlines mainland flights typically use carousels 8–13.",
          walkMinutes: 8,
          tips: [
            "HNL bags can take 20–30 min — the airport is busy and the walk from gate to carousel is longer than it looks",
            "Stay on the same level after exiting the jetway — follow the overhead 'Baggage Claim' signs, not 'Connecting Flights'",
            "If you checked a bag with a lei box or surfboard, oversized baggage is at the far end of the claim area",
          ],
        },
      ],
      exitDirections: "After baggage claim, exit through the glass doors to the ground transportation level. The exit opens onto the roadway — turn left for Uber/Lyft pickup, right for taxis and hotel shuttles.",
      groundTransport: "Rideshare (Uber/Lyft): Exit baggage claim and follow signs to 'App-Based Transportation' — pickup is in the designated zone on the outer curb. Taxis: immediately outside baggage claim exit. TheBus: Route 20 (Airport–Waikiki) stops outside — $3 cash exact change, 45 min to Waikiki. Rental cars: take the inter-terminal shuttle from outside baggage claim to the consolidated rental car facility.",
      connectingFlight: "Connecting to a mainland flight: do NOT exit security. After deplaning, follow 'Connecting Flights' signs to stay airside. Your connecting gate will be in the same Overseas Terminal — check the departure board for the gate.",
      generalTip: "HNL is sprawling but well-signed. The biggest mistake is following 'Exit' signs when you mean to connect — stay airside if connecting.",
    },
    generalNotes: "HNL is open-air in many sections — enjoy the trade winds. Mainland departures are from the Overseas Terminal. Inter-island flights are from the commuter terminal (separate building, requires exiting and re-entering security).",
  },



  // ── Chicago Midway MDW ───────────────────────────────────────
  {
    iata: "MDW",
    name: "Chicago Midway",
    securityNotes: [
      { instruction: "MDW is a single terminal — all gates are accessible from one security checkpoint", mode: "walk", estimatedMinutes: 0, landmark: "After security follow gate letter signs — A/B left, C/D/E right" },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Turn left after security — A gates are the nearest concourse", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk straight from security toward B concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Turn right after security and walk to C concourse", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Turn right and walk past C to D gates", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "E gates are farthest right — walk the full length of the terminal", mode: "walk", estimatedMinutes: 10, landmark: "Southwest gates" }], totalMinutes: 10 },
    ],
    generalNotes: "MDW is a compact single-terminal airport. Almost entirely Southwest Airlines. Easy to navigate — no trains, no shuttles.",
  },

  // ── Kansas City MCI ──────────────────────────────────────────
  {
    iata: "MCI",
    name: "Kansas City",
    securityNotes: [
      { instruction: "MCI has a new single terminal (opened 2023) replacing the old pie-shaped buildings. All gates are in one connected hall after security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Turn left after security — A concourse gates start immediately", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk right from security to B concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
    ],
    generalNotes: "The new MCI single terminal opened in 2023 — modern, easy, no complicated transfers.",
  },

  // ── Tampa TPA ────────────────────────────────────────────────
  {
    iata: "TPA",
    name: "Tampa International",
    securityNotes: [
      { instruction: "TPA uses airside shuttles to reach gate areas. After security take the shuttle to your airside (A, C, E, or F)", mode: "shuttle", estimatedMinutes: 0, landmark: "Shuttle departure is just past security on the departure level" },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Take the Airside A shuttle — runs every 3 min", mode: "shuttle", estimatedMinutes: 5, detail: "American and international flights" }], totalMinutes: 5 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Take the Airside C shuttle — runs every 3 min", mode: "shuttle", estimatedMinutes: 5, detail: "Delta, United, Southwest" }], totalMinutes: 5 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "Take the Airside E shuttle", mode: "shuttle", estimatedMinutes: 6, detail: "Spirit and other carriers" }], totalMinutes: 6 },
      { fromZone: "security", toZone: "F", steps: [{ instruction: "Take the Airside F shuttle", mode: "shuttle", estimatedMinutes: 6, detail: "Southwest and JetBlue" }], totalMinutes: 6 },
    ],
    generalNotes: "TPA uses a hub-and-spoke design — you ride a shuttle from the main terminal to each airside. Shuttles run frequently and take about 3 min.",
  },

  // ── Fort Lauderdale FLL ──────────────────────────────────────
  {
    iata: "FLL",
    name: "Fort Lauderdale-Hollywood",
    securityNotes: [
      { instruction: "FLL has 4 terminals (1–4) in a horseshoe arrangement. Terminals 1 and 2, and 3 and 4, are connected airside. Check your terminal number before security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Walk airside from T1 to T2 — connected via enclosed bridge", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3", toZone: "T4", steps: [{ instruction: "Walk airside from T3 to T4 — connected at gate level", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1", toZone: "T3", steps: [{ instruction: "T1 and T3 are NOT connected airside — exit and walk landside between terminals (~10 min)", mode: "walk", estimatedMinutes: 12, detail: "Use the ground level walkway between terminals" }], totalMinutes: 12 },
    ],
    generalNotes: "FLL is a popular budget airline hub (Spirit, Southwest, JetBlue). T1/T2 are connected, T3/T4 are connected, but crossing between groups requires landside.",
  },

  // ── San Diego SAN ────────────────────────────────────────────
  {
    iata: "SAN",
    name: "San Diego International",
    securityNotes: [
      { instruction: "SAN has two terminals (T1 and T2) plus the Commuter Terminal. T1 and T2 are connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Walk airside from T1 to T2 — connected through a shared corridor", mode: "walk", estimatedMinutes: 6, landmark: "Follow 'T2 Gates' signs past the connector" }], totalMinutes: 6 },
      { fromZone: "T2", toZone: "T1", steps: [{ instruction: "Walk airside from T2 to T1 — reverse direction through the connector", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
    ],
    generalNotes: "SAN is a compact urban airport. T1 (Alaska, Southwest) and T2 (American, Delta, United, international) are airside-connected. Beautiful views of downtown.",
  },

  // ── Sacramento SMF ───────────────────────────────────────────
  {
    iata: "SMF",
    name: "Sacramento International",
    securityNotes: [
      { instruction: "SMF has two terminals (A and B) separated by a central parking structure. Both have their own security checkpoints", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "A-security", toZone: "A", steps: [{ instruction: "All A concourse gates are immediately past security — very compact", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "B-security", toZone: "B", steps: [{ instruction: "All B concourse gates are immediately past security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "A", toZone: "B", steps: [{ instruction: "Exit Terminal A landside and walk to Terminal B via the central roadway (~10 min walk or take the inter-terminal shuttle)", mode: "shuttle", estimatedMinutes: 10 }], totalMinutes: 10 },
    ],
    generalNotes: "SMF is a simple two-terminal airport. Southwest and Alaska use Terminal A; American, Delta, United, and international use Terminal B.",
  },

  // ── Oakland OAK ──────────────────────────────────────────────
  {
    iata: "OAK",
    name: "Oakland International",
    securityNotes: [
      { instruction: "OAK has two terminals — T1 (Southwest) and T2 (other airlines). They have separate security checkpoints", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "All Southwest gates are immediately past T1 security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "Walk from T2 security toward your gate — T2 is a single straight concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
    ],
    generalNotes: "OAK is a simple, uncrowded alternative to SFO. Budget airport feel with short walks and easy parking.",
  },

  // ── Burbank BUR ──────────────────────────────────────────────
  {
    iata: "BUR",
    name: "Hollywood Burbank",
    securityNotes: [
      { instruction: "BUR is one of the smallest major airports in the US — single terminal, all gates within a 5-min walk of security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Walk straight ahead from security — all gates are right there", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
    ],
    generalNotes: "BUR is tiny and easy — no trains, no shuttles, no long walks. A gate is always close. Great alternative to LAX for the San Fernando Valley.",
  },

  // ── Nashville BNA ────────────────────────────────────────────
  {
    iata: "BNA",
    name: "Nashville International",
    securityNotes: [
      { instruction: "BNA has a single terminal with concourses A–D all connected airside after security", mode: "walk", estimatedMinutes: 0, landmark: "A/B gates are left, C/D are straight ahead" },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Turn left after security — A gates are the first concourse", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk left and continue past A to B concourse", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Walk straight ahead from security to C concourse", mode: "walk", estimatedMinutes: 5, landmark: "Delta hub gates" }], totalMinutes: 5 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Walk straight and continue to D concourse — farthest from security", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
    ],
    generalNotes: "BNA has undergone major expansion. Modern, straightforward single-terminal layout. Nashville is a Delta and Southwest hub.",
  },

  // ── Raleigh-Durham RDU ───────────────────────────────────────
  {
    iata: "RDU",
    name: "Raleigh-Durham",
    securityNotes: [
      { instruction: "RDU has two terminals — T1 (American) and T2 (all other airlines). They are NOT connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "Walk from T1 security — all American gates are directly ahead", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "Walk from T2 security to your gate — single straight concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
    ],
    generalNotes: "RDU T1 is American-only; T2 handles Delta, Southwest, United, and others. Make sure you arrive at the correct terminal.",
  },

  // ── Austin AUS ───────────────────────────────────────────────
  {
    iata: "AUS",
    name: "Austin-Bergstrom",
    securityNotes: [
      { instruction: "AUS has the Barbara Jordan Terminal (main) and the South Terminal (budget carriers only). The main terminal has concourses 1–5 all connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "1", steps: [{ instruction: "Gates 1–9 are immediately past the main security checkpoint", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "2", steps: [{ instruction: "Walk to the center hub and follow signs to gates 10–19", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "3", steps: [{ instruction: "Walk through the main terminal hub to gates 20+", mode: "walk", estimatedMinutes: 7 }], totalMinutes: 7 },
    ],
    generalNotes: "AUS is expanding rapidly. The main Barbara Jordan Terminal is modern and easy to navigate. The South Terminal is a separate building for Allegiant and some charters — check your terminal.",
  },

  // ── San Antonio SAT ──────────────────────────────────────────
  {
    iata: "SAT",
    name: "San Antonio International",
    securityNotes: [
      { instruction: "SAT has two terminals (A and B) side by side with a shared curbside but separate security. Check your terminal", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "A-security", toZone: "A", steps: [{ instruction: "All Terminal A gates are immediately past security — small terminal", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "B-security", toZone: "B", steps: [{ instruction: "All Terminal B gates are directly past security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
    ],
    generalNotes: "SAT is a small, easy airport. American and Southwest dominate. Both terminals are compact with very short walks.",
  },

  // ── Indianapolis IND ─────────────────────────────────────────
  {
    iata: "IND",
    name: "Indianapolis International",
    securityNotes: [
      { instruction: "IND has a single modern terminal with concourses A and B connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Turn left after security — Concourse A starts immediately", mode: "walk", estimatedMinutes: 4, landmark: "Southwest and Delta gates" }], totalMinutes: 4 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk right from security to Concourse B", mode: "walk", estimatedMinutes: 5, landmark: "American and United gates" }], totalMinutes: 5 },
    ],
    generalNotes: "IND is a modern, award-winning airport that's very easy to navigate. Everything is on one level airside.",
  },

  // ── Columbus CMH ─────────────────────────────────────────────
  {
    iata: "CMH",
    name: "John Glenn Columbus",
    securityNotes: [
      { instruction: "CMH has a single terminal with concourses A, B, and C all connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "A concourse is straight ahead past security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "B concourse is to the right of A — walk straight through", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "C concourse is farthest — continue past B gates", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
    ],
    generalNotes: "CMH is a simple, easy airport. Everything connects airside with short walks.",
  },

  // ── Milwaukee MKE ────────────────────────────────────────────
  {
    iata: "MKE",
    name: "Milwaukee Mitchell",
    securityNotes: [
      { instruction: "MKE has a single terminal with concourses C and D connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Turn left after security for Concourse C", mode: "walk", estimatedMinutes: 4, landmark: "Southwest and American gates" }], totalMinutes: 4 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Turn right after security for Concourse D", mode: "walk", estimatedMinutes: 4, landmark: "Delta, United, Frontier" }], totalMinutes: 4 },
    ],
    generalNotes: "MKE is a small, easy airport — rarely crowded, quick security, short walks.",
  },

  // ── Omaha OMA ────────────────────────────────────────────────
  {
    iata: "OMA",
    name: "Eppley Airfield Omaha",
    securityNotes: [
      { instruction: "OMA has a single terminal with two concourses (A and B) connected airside — one of the simplest US airports", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is immediately past security on the left", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Concourse B is immediately past security on the right", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
    ],
    generalNotes: "OMA is tiny — you'll be at your gate in under 5 min from the curb.",
  },

  // ── Cincinnati CVG ───────────────────────────────────────────
  {
    iata: "CVG",
    name: "Cincinnati/Northern Kentucky",
    securityNotes: [
      { instruction: "CVG has a main terminal with concourses A, B, and C all connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is straight ahead past security", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk past A to reach Concourse B", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Concourse C is farthest — continue through B gates", mode: "walk", estimatedMinutes: 9 }], totalMinutes: 9 },
    ],
    generalNotes: "CVG is a former Delta hub that's now a quiet, easy airport with short security lines.",
  },

  // ── Albuquerque ABQ ──────────────────────────────────────────
  {
    iata: "ABQ",
    name: "Albuquerque Sunport",
    securityNotes: [
      { instruction: "ABQ has a single terminal with concourses A, B, and C all airside connected", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is directly past security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk through A to reach Concourse B", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Concourse C is farthest — continue past B", mode: "walk", estimatedMinutes: 7 }], totalMinutes: 7 },
    ],
    generalNotes: "ABQ has Pueblo Revival architecture — it's one of the most beautiful small US airports. Very easy to navigate.",
  },

  // ── New Orleans MSY ──────────────────────────────────────────
  {
    iata: "MSY",
    name: "Louis Armstrong New Orleans",
    securityNotes: [
      { instruction: "The new MSY terminal (opened 2019) has two concourses (A and B) connected airside in a single modern building", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is to the left after security", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Concourse B is to the right after security", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
    ],
    generalNotes: "The new MSY terminal opened in 2019 and replaced the cramped old building. Modern, easy, and well-signed.",
  },

  // ── Baltimore BWI ────────────────────────────────────────────
  {
    iata: "BWI",
    name: "Baltimore/Washington",
    securityNotes: [
      { instruction: "BWI has a single terminal with concourses A through F connected airside in a loop", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "A concourse is closest to the main security checkpoint", mode: "walk", estimatedMinutes: 4, landmark: "International and American gates" }], totalMinutes: 4 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk from security toward B — passes through A", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Walk through A and B to reach C", mode: "walk", estimatedMinutes: 8, landmark: "Southwest's largest concourse" }], totalMinutes: 8 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Walk through A–C to D concourse", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "E is the farthest concourse — full loop walk", mode: "walk", estimatedMinutes: 13 }], totalMinutes: 13 },
    ],
    generalNotes: "BWI is a Southwest hub. The terminal is a long loop — C concourse (Southwest) can be a 10-min walk from security. Allow extra time.",
  },

  // ── Washington Reagan DCA ────────────────────────────────────
  {
    iata: "DCA",
    name: "Washington Reagan National",
    securityNotes: [
      { instruction: "DCA has 3 terminals: Terminal A (historic, rarely used), Terminal B/C (main). Most flights use the B/C connector. After security follow gate letters", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "B-security", toZone: "B", steps: [{ instruction: "Terminal B gates are immediately past security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "B-security", toZone: "C", steps: [{ instruction: "Walk through the B/C connector to reach Terminal C gates", mode: "walk", estimatedMinutes: 6, landmark: "American Airlines gates" }], totalMinutes: 6 },
      { fromZone: "C-security", toZone: "C", steps: [{ instruction: "All C gates are directly past Terminal C security", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
    ],
    generalNotes: "DCA is directly on the Metro (Blue/Yellow line). Very convenient for DC travel. American dominates T-C. Short security lines outside peak hours.",
  },

  // ── Detroit DTW ──────────────────────────────────────────────
  {
    iata: "DTW",
    name: "Detroit Metropolitan",
    securityNotes: [
      { instruction: "DTW has two main terminals: McNamara (Delta hub, concourses A/B/C/D) and North Terminal (other airlines). They are NOT connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "McNamara", toZone: "A", steps: [{ instruction: "After McNamara security take the underground train to Concourse A (Delta Shuttle gates)", mode: "train", estimatedMinutes: 5, detail: "Train runs every 2–3 min from the main security hall" }], totalMinutes: 5 },
      { fromZone: "McNamara", toZone: "B", steps: [{ instruction: "Take the underground train to Concourse B", mode: "train", estimatedMinutes: 6, detail: "Main Delta hub gates" }], totalMinutes: 6 },
      { fromZone: "McNamara", toZone: "C", steps: [{ instruction: "Take the underground train to Concourse C (international)", mode: "train", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "North", toZone: "NW", steps: [{ instruction: "North Terminal gates are directly past security — walk straight ahead", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
    ],
    generalNotes: "DTW McNamara is Delta's hub — it has an underground train connecting the main hall to concourses A, B, C, D. The North Terminal is separate for American, Southwest, and others.",
  },

  // ── Philadelphia PHL ─────────────────────────────────────────
  {
    iata: "PHL",
    name: "Philadelphia",
    securityNotes: [
      { instruction: "PHL has terminals A through F. A/B are domestic/international (connected airside). C/D/E are connected. F is separate. American hub", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "A-B-security", toZone: "A", steps: [{ instruction: "A gates are immediately past the A/B security checkpoint — international and American flights", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "A-B-security", toZone: "B", steps: [{ instruction: "Walk from A/B security through A to reach B concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "C-D-security", toZone: "C", steps: [{ instruction: "C gates are directly past the C/D security checkpoint", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
      { fromZone: "C-D-security", toZone: "D", steps: [{ instruction: "Walk from C/D security through C to D", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "C-D-security", toZone: "E", steps: [{ instruction: "Walk from C/D security through C and D to E concourse", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "F-security", toZone: "F", steps: [{ instruction: "F concourse gates are directly past F security", mode: "walk", estimatedMinutes: 3, detail: "Southwest gates" }], totalMinutes: 3 },
    ],
    generalNotes: "PHL is complex — multiple security checkpoints for different terminal groups. Make sure you go to the right checkpoint. American dominates A–E; Southwest uses F.",
  },

  // ── Charlotte CLT ─────────────────────────────────────────────
  {
    iata: "CLT",
    name: "Charlotte Douglas",
    securityNotes: [
      { instruction: "CLT is an American Airlines hub with concourses A through F all connected airside. Concourses E and B are connected via an underground walkway", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "After security follow signs right to Concourse A", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk from security toward the central hub and follow B signs", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "C concourse is through the central hub — largest concourse", mode: "walk", estimatedMinutes: 7 }], totalMinutes: 7 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "D concourse is past C — follow the main corridor", mode: "walk", estimatedMinutes: 9 }], totalMinutes: 9 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "Take the underground tunnel from main terminal to Concourse E (international/American Eagle)", mode: "walk", estimatedMinutes: 10, landmark: "Tunnel entrance is near the center of the main terminal" }], totalMinutes: 10 },
    ],
    generalNotes: "CLT is a large American hub in a single elongated building. All gates are reachable on foot — no train — but E gates require a tunnel walk. Allow 12–15 min to far E gates.",
  },

  // ── Salt Lake City SLC ────────────────────────────────────────
  {
    iata: "SLC",
    name: "Salt Lake City",
    securityNotes: [
      { instruction: "The new SLC terminal (opened 2020) has two concourses (A and B) connected by a central hub. Both accessible from one security checkpoint area", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is to the left of the central hub after security — Delta gates", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Concourse B is to the right of the central hub — other airlines", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
    ],
    generalNotes: "The new SLC terminal is modern and easy. Delta hub. Both concourses fan out from a central hub — symmetrical and intuitive.",
  },

  // ── Phoenix PHX ───────────────────────────────────────────────
  {
    iata: "PHX",
    name: "Phoenix Sky Harbor",
    securityNotes: [
      { instruction: "PHX has Terminal 3 and Terminal 4 (Terminal 2 closed in 2020). They are NOT connected airside — make sure you go to the right one", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T3-security", toZone: "T3", steps: [{ instruction: "All T3 gates are directly past security — A and B concourses", mode: "walk", estimatedMinutes: 4, detail: "Alaska, Southwest, and others" }], totalMinutes: 4 },
      { fromZone: "T4-security", toZone: "T4", steps: [{ instruction: "T4 has gates B–E all connected airside from one security checkpoint", mode: "walk", estimatedMinutes: 4, detail: "American hub terminal" }], totalMinutes: 4 },
      { fromZone: "T4-security", toZone: "E", steps: [{ instruction: "Walk all the way through T4 to Concourse E — farthest gates", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "T3", toZone: "T4", steps: [{ instruction: "Take the free PHX Sky Train between T3 and T4", detail: "Runs every 3–5 min, takes 3 min. Also connects to rental cars and the Rental Car Center", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
    ],
    generalNotes: "PHX has a free Sky Train connecting T3, T4, and the car rental center. American dominates T4. Hot weather tip: the covered train is much better than walking outside.",
  },

  // ── Las Vegas LAS ─────────────────────────────────────────────
  {
    iata: "LAS",
    name: "Harry Reid Las Vegas",
    securityNotes: [
      { instruction: "LAS has Terminal 1 (Concourses B and C) and Terminal 3 (Concourse D). T1 and T3 are NOT connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "B", steps: [{ instruction: "After T1 security take the elevated tram to Concourse B", mode: "tram", estimatedMinutes: 5, detail: "Runs continuously, 2-min ride" }], totalMinutes: 5 },
      { fromZone: "T1-security", toZone: "C", steps: [{ instruction: "Take the elevated tram to Concourse C from T1", mode: "tram", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3-security", toZone: "D", steps: [{ instruction: "Concourse D is directly past T3 security — all international and premium airlines", mode: "walk", estimatedMinutes: 5, detail: "United, Delta, American long-haul, British Airways, Condor" }], totalMinutes: 5 },
    ],
    generalNotes: "LAS T1 (B and C) serves Southwest, Alaska, and domestic carriers. T3 (D) serves international and larger domestic carriers. T1 requires a tram to reach concourses.",
  },

  // ── Orlando MCO ───────────────────────────────────────────────
  {
    iata: "MCO",
    name: "Orlando International",
    securityNotes: [
      { instruction: "MCO uses a hub-and-spoke system — the main terminal (Level 3) connects to 4 airside buildings via automated monorail. Airside 1/2 left, Airside 3/4 right", mode: "train", estimatedMinutes: 0, landmark: "Monorail stations are past security on Level 3" },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "1", steps: [{ instruction: "Take the left monorail to Airside 1 — gates 1–29", detail: "Southwest gates. Runs every 3 min", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "2", steps: [{ instruction: "Take the left monorail to Airside 2 — gates 100–129", detail: "Delta, JetBlue, Spirit", mode: "train", estimatedMinutes: 7 }], totalMinutes: 7 },
      { fromZone: "security", toZone: "3", steps: [{ instruction: "Take the right monorail to Airside 3 — gates 1–99", detail: "American, United", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "4", steps: [{ instruction: "Take the right monorail to Airside 4 — gates 200–299", detail: "International and British Airways", mode: "train", estimatedMinutes: 7 }], totalMinutes: 7 },
    ],
    generalNotes: "MCO's monorail is mandatory — there's no walking path to the gates. If you miss the monorail you have to wait for the next one. Give yourself 15 min past security.",
  },

  // ════════════════════════════════════════════════════════════
  //  TIER 3 — MAJOR INTERNATIONAL HUBS
  // ════════════════════════════════════════════════════════════

  // ── Tokyo Narita NRT ─────────────────────────────────────────
  {
    iata: "NRT",
    name: "Tokyo Narita",
    securityNotes: [
      { instruction: "NRT has Terminal 1 (Star Alliance), Terminal 2 (oneworld / SkyTeam), and Terminal 3 (budget carriers). T1 and T2 are connected by a free shuttle. T3 is further away", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1", toZone: "T1-N", steps: [{ instruction: "T1 has a North Wing and South Wing — follow gate signs after security", mode: "walk", estimatedMinutes: 5, detail: "ANA and Star Alliance in T1" }], totalMinutes: 5 },
      { fromZone: "T2", toZone: "T2", steps: [{ instruction: "T2 is a single concourse — gates are directly past security", mode: "walk", estimatedMinutes: 4, detail: "JAL, Delta, American, Air France in T2" }], totalMinutes: 4 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the free inter-terminal shuttle bus between T1 and T2", detail: "Runs every 5 min, 5-min ride", mode: "shuttle", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "T2", toZone: "T3", steps: [{ instruction: "Walk 500m along the outdoor walkway to Terminal 3, or take the shuttle bus", detail: "T3 serves Jetstar, Scoot, Spring Japan — budget carriers", mode: "walk", estimatedMinutes: 15 }], totalMinutes: 15 },
    ],
    generalNotes: "NRT is large — allow 90 min before departure for international flights. T1 (ANA/Star) and T2 (JAL/oneworld/SkyTeam) connect by shuttle.",
  },

  // ── Seoul Incheon ICN ─────────────────────────────────────────
  {
    iata: "ICN",
    name: "Seoul Incheon",
    securityNotes: [
      { instruction: "ICN has Terminal 1 (most airlines) and Terminal 2 (Korean Air, Delta, Air France, KLM). They are SEPARATE — confirm your terminal before arriving", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "After security follow concourse signs — T1 is a wide straight hall with gates on both sides", mode: "walk", estimatedMinutes: 5, landmark: "Transit hotel and duty-free mall in the center of T1" }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 is a modern single-level concourse — gates are past security on both sides", mode: "walk", estimatedMinutes: 5, detail: "Korean Air, Delta, Air France, KLM use T2" }], totalMinutes: 5 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the free shuttle bus from T1 to T2", detail: "Runs every 5–10 min, 15-min ride. Or take the AREX train between terminals", mode: "shuttle", estimatedMinutes: 20 }], totalMinutes: 20 },
      { fromZone: "T1", toZone: "Concourse",  steps: [{ instruction: "If gate is in the Concourse satellite, take the underground people mover from T1 main", mode: "train", estimatedMinutes: 8, detail: "Runs every 3 min. Required for most long-haul gates" }], totalMinutes: 8 },
    ],
    generalNotes: "ICN is consistently rated one of the best airports in the world. T2 is the newest terminal. Allow 90 min for international departures — duty-free is worth exploring if time permits.",
  },

  // ── Beijing Capital PEK ───────────────────────────────────────
  {
    iata: "PEK",
    name: "Beijing Capital",
    securityNotes: [
      { instruction: "PEK has 3 terminals — T1 (domestic, rarely used), T2 (most domestic Air China), T3 (international + Air China long-haul). T2 and T3 are connected by free APM train", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T3-security", toZone: "T3D", steps: [{ instruction: "T3D is the domestic departure hall — gates directly past security", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3-security", toZone: "T3E", steps: [{ instruction: "Take the APM train within T3 from the main hall to T3E (international)", mode: "train", estimatedMinutes: 8, detail: "APM runs every 5 min" }], totalMinutes: 8 },
      { fromZone: "T2", toZone: "T3", steps: [{ instruction: "Take the free inter-terminal APM from T2 to T3", mode: "train", estimatedMinutes: 12 }], totalMinutes: 12 },
    ],
    generalNotes: "PEK T3 is enormous — designed by Norman Foster for the 2008 Olympics. Allow extra time. Note: Beijing now also has Daxing Airport (PKX) — confirm which airport your flight uses.",
  },

  // ── Shanghai Pudong PVG ───────────────────────────────────────
  {
    iata: "PVG",
    name: "Shanghai Pudong",
    securityNotes: [
      { instruction: "PVG has two terminals T1 and T2, connected by an airside underground walkway. Most international flights use T2", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 gates are directly past security — follow concourse signs", mode: "walk", estimatedMinutes: 5, detail: "China Eastern domestic and some international" }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 gates are directly past security — large international terminal", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the airside underground connecting walkway between T1 and T2", mode: "walk", estimatedMinutes: 10, detail: "Moving walkways available — follow orange 'Transfer' signs" }], totalMinutes: 10 },
    ],
    generalNotes: "PVG serves most international flights to Shanghai. Efficient and well-signed. Maglev train connects to central Shanghai in 8 min.",
  },

  // ── Hong Kong HKG ─────────────────────────────────────────────
  {
    iata: "HKG",
    name: "Hong Kong International",
    securityNotes: [
      { instruction: "HKG has one main terminal and a separate North Satellite Concourse (NSC) connected by APM. After security check if your gate is in the main building or NSC", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "1-200", steps: [{ instruction: "Gates 1–200 series are in the main terminal building — walk from security", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "NSC", steps: [{ instruction: "Take the APM to the North Satellite Concourse for gates 500+", detail: "Runs continuously, 3-min ride. Station is past security near gate 60", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "security", toZone: "500", steps: [{ instruction: "Take the APM to the North Satellite Concourse (NSC) for 500-series gates", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
    ],
    generalNotes: "HKG is an island airport connected to the city by the Airport Express (24 min to Hong Kong station). Very efficient and clean. Allow 90 min for international departures.",
  },

  // ── Bangkok Suvarnabhumi BKK ──────────────────────────────────
  {
    iata: "BKK",
    name: "Bangkok Suvarnabhumi",
    securityNotes: [
      { instruction: "BKK is a single large terminal with concourses A through G all connected airside after security. Gates are numbered by concourse", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is to the left after the main security hall — closest to arrivals", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Concourse D is the central hub — walk straight from security", mode: "walk", estimatedMinutes: 7, landmark: "Thai Airways hub" }], totalMinutes: 7 },
      { fromZone: "security", toZone: "G", steps: [{ instruction: "Concourse G is the farthest — walk the full length of the terminal", mode: "walk", estimatedMinutes: 15, detail: "Allow extra time for G gates" }], totalMinutes: 15 },
    ],
    generalNotes: "BKK is a very large single-terminal airport. G concourse can be a long walk — allow 20 min from security. Suvarnabhumi Airport Rail Link connects to central Bangkok in 30 min.",
  },

  // ── Kuala Lumpur KUL ──────────────────────────────────────────
  {
    iata: "KUL",
    name: "Kuala Lumpur International",
    securityNotes: [
      { instruction: "KLIA has the main terminal and Satellite Building A connected by an airside Aerotrain. Most long-haul gates are in Satellite A", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "main", steps: [{ instruction: "After security some gates are in the main terminal building — follow signs", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Take the Aerotrain from the main terminal to Satellite A", detail: "Runs every 3–5 min, 3-min ride. Most international gates including Malaysia Airlines", mode: "train", estimatedMinutes: 7 }], totalMinutes: 7 },
    ],
    generalNotes: "KLIA has two airports: the main KLIA and KLIA2 (budget carriers — AirAsia). They are SEPARATE buildings. KLIA2 requires a different terminal — confirm before you go.",
  },

  // ── Sydney SYD ────────────────────────────────────────────────
  {
    iata: "SYD",
    name: "Sydney Kingsford Smith",
    securityNotes: [
      { instruction: "SYD has T1 (International), T2 (Virgin Australia + domestic), and T3 (Qantas domestic). T2 and T3 are connected airside. T1 is separate", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 international gates are directly past security in the departure hall", mode: "walk", estimatedMinutes: 5, detail: "All international carriers" }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 domestic gates are past security — Virgin Australia hub", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "T3-security", toZone: "T3", steps: [{ instruction: "T3 gates are directly past Qantas security — Qantas domestic hub", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "T2", toZone: "T3", steps: [{ instruction: "Walk airside from T2 to T3 — connected by an enclosed walkway", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "T1 to T2/T3 requires landside transfer — take the free T-Bus or walk (~10 min)", mode: "shuttle", estimatedMinutes: 12, detail: "T-Bus runs every 10 min from T1 arrivals level" }], totalMinutes: 12 },
    ],
    generalNotes: "SYD domestic (T2/T3) and international (T1) are separate. For domestic connections from international flights allow 60+ min — the transfer requires going landside.",
  },

  // ── Melbourne MEL ─────────────────────────────────────────────
  {
    iata: "MEL",
    name: "Melbourne Tullamarine",
    securityNotes: [
      { instruction: "MEL has T1 (Qantas domestic), T2 (International + Virgin + others), T3 (Qantas international), T4 (budget domestic). T2/T3 are connected; T1 and T4 are separate", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 Qantas domestic gates are directly past security", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 international and domestic gates are past security", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T2", toZone: "T3", steps: [{ instruction: "Walk airside from T2 to T3 (Qantas International) via the connector", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the SkyBus inter-terminal shuttle or walk landside between T1 and T2 (~8 min)", mode: "shuttle", estimatedMinutes: 8 }], totalMinutes: 8 },
    ],
    generalNotes: "MEL has a confusing terminal layout. T1 (Qantas domestic) and T4 (budget) are separate from T2/T3. Check your terminal number carefully.",
  },

  // ── Paris CDG ─────────────────────────────────────────────────
  {
    iata: "CDG",
    name: "Paris Charles de Gaulle",
    securityNotes: [
      { instruction: "CDG has 3 main terminals: T1 (Star Alliance), T2 (Air France / SkyTeam, split into 2A–2G), and T3 (budget). T1 and T2 are connected by CDGVAL free shuttle", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T2E-security", toZone: "T2E", steps: [{ instruction: "T2E is Air France's main long-haul hall — follow boarding pier signs after security", mode: "walk", estimatedMinutes: 5, detail: "Long piers extend from the central oval" }], totalMinutes: 5 },
      { fromZone: "T2F-security", toZone: "T2F", steps: [{ instruction: "T2F is opposite T2E — walk from security to your gate pier", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T2", toZone: "T1", steps: [{ instruction: "Take the CDGVAL automated shuttle from T2 to T1", detail: "Free, runs every 4 min, takes 8 min. Station is on arrivals level of each terminal", mode: "train", estimatedMinutes: 12 }], totalMinutes: 12 },
      { fromZone: "T2E", toZone: "T2F", steps: [{ instruction: "T2E and T2F face each other — walk through the secure connector between the two", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T2", toZone: "T2G", steps: [{ instruction: "T2G is the Schengen low-cost hall — take the CDGVAL one stop to T2G station", mode: "train", estimatedMinutes: 6 }], totalMinutes: 6 },
    ],
    generalNotes: "CDG is large and complex — allow 90 min. T2 has 7 sub-terminals (A–G), each with their own security. Confirm your exact sub-terminal from your boarding pass.",
  },

  // ── Amsterdam AMS ─────────────────────────────────────────────
  {
    iata: "AMS",
    name: "Amsterdam Schiphol",
    securityNotes: [
      { instruction: "AMS is a single terminal in a triangle shape — after passport control follow pier numbers (B, C, D, E, F, G, H). Each pier has its own security checkpoint", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "passport-control", toZone: "B", steps: [{ instruction: "Pier B is the closest — follow signs left from passport control", mode: "walk", estimatedMinutes: 5, detail: "KLM and SkyTeam European flights" }], totalMinutes: 5 },
      { fromZone: "passport-control", toZone: "C", steps: [{ instruction: "Walk from passport control toward C pier — Schengen zone", mode: "walk", estimatedMinutes: 7 }], totalMinutes: 7 },
      { fromZone: "passport-control", toZone: "D", steps: [{ instruction: "Pier D is straight ahead from central passport control — KLM intercontinental hub", mode: "walk", estimatedMinutes: 8, detail: "KLM long-haul and Delta" }], totalMinutes: 8 },
      { fromZone: "passport-control", toZone: "E", steps: [{ instruction: "Pier E is to the right — follow the long corridor", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "passport-control", toZone: "F", steps: [{ instruction: "Pier F requires a longer walk — allow 15 min from passport control", mode: "walk", estimatedMinutes: 15, detail: "Non-Schengen and intercontinental flights" }], totalMinutes: 15 },
      { fromZone: "passport-control", toZone: "G", steps: [{ instruction: "Pier G is at the far end of the terminal — budget carriers and charter flights", mode: "walk", estimatedMinutes: 18 }], totalMinutes: 18 },
      { fromZone: "passport-control", toZone: "H", steps: [{ instruction: "Pier H is the farthest — allow 20 min from passport control", mode: "walk", estimatedMinutes: 20 }], totalMinutes: 20 },
    ],
    generalNotes: "AMS is one unified terminal but very spread out. Piers B–H each have their own security. Know your pier from your boarding pass and allow 15–20 min for far piers.",
  },

  // ── Frankfurt FRA ─────────────────────────────────────────────
  {
    iata: "FRA",
    name: "Frankfurt",
    securityNotes: [
      { instruction: "FRA has Terminal 1 (A/B/C/Z concourses — Lufthansa hub) and Terminal 2 (D/E concourses — non-Lufthansa). Connected by SkyLine people mover", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "A", steps: [{ instruction: "Concourse A is directly past T1 security — Lufthansa long-haul and Star Alliance", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1-security", toZone: "B", steps: [{ instruction: "Walk from T1 security to Concourse B — Lufthansa European flights", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T1-security", toZone: "C", steps: [{ instruction: "Concourse C is the farthest in T1 — follow signs from main security", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the SkyLine people mover from T1 to T2", detail: "Free, runs every 2–3 min, takes 3 min. Station is between Concourses B and C in T1", mode: "train", estimatedMinutes: 7 }], totalMinutes: 7 },
      { fromZone: "T2-security", toZone: "D", steps: [{ instruction: "Concourse D is directly past T2 security — non-Lufthansa international flights", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "E", steps: [{ instruction: "Walk from T2 security to Concourse E", mode: "walk", estimatedMinutes: 7 }], totalMinutes: 7 },
    ],
    generalNotes: "FRA is a Lufthansa hub. T1 and T2 are connected by the free SkyLine train. Allow 75–90 min for international connections — security queues can be long.",
  },

  // ── Munich MUC ────────────────────────────────────────────────
  {
    iata: "MUC",
    name: "Munich",
    securityNotes: [
      { instruction: "MUC has Terminal 1 (non-Lufthansa) and Terminal 2 (Lufthansa / Star Alliance). T2 has a satellite building (T2S) connected by underground walkway", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 gates are directly past security — single straight concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 main gates are directly past security", mode: "walk", estimatedMinutes: 5, detail: "Lufthansa European flights" }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2S", steps: [{ instruction: "Take the underground moving walkway from T2 to the T2 Satellite building", detail: "Walk 5 min along the underground connector to T2S — Lufthansa long-haul gates", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Walk from T1 to T2 via the connecting hall in the center of the airport", mode: "walk", estimatedMinutes: 8, landmark: "The central MAC Forum connects both terminals at ground level" }], totalMinutes: 8 },
    ],
    generalNotes: "MUC is clean, efficient, and easier than FRA. T2 and T2 Satellite are Lufthansa's home. The central MAC Forum shopping area connects both terminals.",
  },

  // ── Madrid MAD ────────────────────────────────────────────────
  {
    iata: "MAD",
    name: "Madrid Barajas",
    securityNotes: [
      { instruction: "MAD has 4 terminals: T1 (Star Alliance except Iberia), T2 (some Schengen), T3 (regional), T4 (Iberia / oneworld). T4 has a satellite T4S connected by underground train", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T4-security", toZone: "T4", steps: [{ instruction: "T4 gates are directly past security — Iberia hub with departures on both sides", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T4-security", toZone: "T4S", steps: [{ instruction: "Take the underground train from T4 to T4S (Satellite)", detail: "Runs every 3 min, takes 3 min. Non-Schengen long-haul Iberia flights", mode: "train", estimatedMinutes: 7 }], totalMinutes: 7 },
      { fromZone: "T4", toZone: "T1", steps: [{ instruction: "Free shuttle bus between T4 and T1/T2/T3", detail: "Runs every 10 min, takes 10 min. Or take the Metro (Line 8)", mode: "shuttle", estimatedMinutes: 15 }], totalMinutes: 15 },
    ],
    generalNotes: "MAD T4 is the main Iberia hub — Richard Rogers-designed, very spacious. T1/T2/T3 are older buildings for non-Iberia carriers. Allow 90 min for international flights.",
  },

  // ── Barcelona BCN ─────────────────────────────────────────────
  {
    iata: "BCN",
    name: "Barcelona El Prat",
    securityNotes: [
      { instruction: "BCN has Terminal 1 (large modern terminal) and Terminal 2 (older, smaller, budget carriers). They are NOT connected airside — confirm your terminal", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 has concourses A, B, C, D, and E all connected airside. Follow gate letter signs", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1-security", toZone: "E", steps: [{ instruction: "Concourse E is the farthest in T1 — walk past A, B, C, D to reach E", mode: "walk", estimatedMinutes: 12, detail: "Non-Schengen flights" }], totalMinutes: 12 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 gates are directly past security — single long hall for budget carriers", mode: "walk", estimatedMinutes: 4, detail: "Vueling, Ryanair, easyJet" }], totalMinutes: 4 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Free shuttle bus between T1 and T2 — runs every 5 min, 7-min ride", mode: "shuttle", estimatedMinutes: 12 }], totalMinutes: 12 },
    ],
    generalNotes: "BCN T1 is the main terminal for international flights. T2 is the older building used by Vueling and Ryanair. The Aerobús to the city center takes 35 min.",
  },

  // ── Rome Fiumicino FCO ────────────────────────────────────────
  {
    iata: "FCO",
    name: "Rome Fiumicino",
    securityNotes: [
      { instruction: "FCO has 4 terminals: T1 (Schengen charter), T2 (some domestic), T3 (main international and Alitalia/ITA), T5 (non-Schengen security point). T1/T2/T3 are connected landside; T5 is separate for some flights", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T3-security", toZone: "T3", steps: [{ instruction: "T3 gates are past security — ITA Airways hub with international gates on both sides", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3-security", toZone: "E", steps: [{ instruction: "Concourse E in T3 is for non-Schengen international — walk from main security through the terminal", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "T1", toZone: "T3", steps: [{ instruction: "Walk from T1 through T2 to T3 — all connected by internal corridors", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
    ],
    generalNotes: "FCO T3 is the main terminal. Leonardo Express train connects FCO to Roma Termini in 32 min. Allow 90 min for international flights.",
  },

  // ── Istanbul IST ──────────────────────────────────────────────
  {
    iata: "IST",
    name: "Istanbul Airport",
    securityNotes: [
      { instruction: "Istanbul Airport (opened 2019) is one of the world's largest — single massive terminal with concourses A through F. All connected airside after security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A is directly past the main security checkpoint — domestic and near-international flights", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk from security through A to Concourse B", mode: "walk", estimatedMinutes: 8, detail: "Turkish Airlines short-haul" }], totalMinutes: 8 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Walk from security to Concourse C — central hub for Turkish Airlines", mode: "walk", estimatedMinutes: 10, detail: "Turkish Airlines main hub" }], totalMinutes: 10 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Walk to Concourse D — long-haul gates for Turkish Airlines", mode: "walk", estimatedMinutes: 15 }], totalMinutes: 15 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "Concourse E requires a very long walk from security — allow 20 min", mode: "walk", estimatedMinutes: 20, detail: "Far end of the terminal" }], totalMinutes: 20 },
    ],
    generalNotes: "Istanbul Airport is enormous — allow 90 min for all flights. Turkish Airlines is the hub carrier. Distances are very long to far concourses — start walking as soon as you clear security.",
  },

  // ── Copenhagen CPH ────────────────────────────────────────────
  {
    iata: "CPH",
    name: "Copenhagen",
    securityNotes: [
      { instruction: "CPH has Pier A (Schengen), Pier B (non-Schengen domestic-style), Pier C (SAS/Star Alliance), and Pier D/E (non-Schengen international). All connected after security", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Pier C is directly past security — SAS hub for Scandinavian routes", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Walk from security through the main terminal to Pier D", mode: "walk", estimatedMinutes: 8, detail: "Non-Schengen international flights" }], totalMinutes: 8 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "Pier E is the farthest — walk through D to reach E", mode: "walk", estimatedMinutes: 12 }], totalMinutes: 12 },
    ],
    generalNotes: "CPH is a clean, efficient Scandinavian airport. Metro connects to central Copenhagen in 14 min. Excellent duty-free and food options before security.",
  },

  // ── Stockholm Arlanda ARN ─────────────────────────────────────
  {
    iata: "ARN",
    name: "Stockholm Arlanda",
    securityNotes: [
      { instruction: "ARN has Terminals 2 (international non-Schengen), 3, 4, and 5 (all domestic/Schengen). T5 is SAS hub and the largest. T2/T5 are connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T5-security", toZone: "T5", steps: [{ instruction: "T5 gates are directly past security — SAS domestic and European hub", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T5", toZone: "T2", steps: [{ instruction: "Walk from T5 to T2 via the airside connector for non-Schengen international flights", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "T4-security", toZone: "T4", steps: [{ instruction: "T4 is a compact terminal for Ryanair and budget carriers", mode: "walk", estimatedMinutes: 3 }], totalMinutes: 3 },
    ],
    generalNotes: "ARN Arlanda Express connects to central Stockholm in 18 min. T5 is the main SAS terminal. T2 handles non-EU international flights.",
  },

  // ── Toronto Pearson YYZ ───────────────────────────────────────
  {
    iata: "YYZ",
    name: "Toronto Pearson",
    securityNotes: [
      { instruction: "YYZ has Terminal 1 (Air Canada / Star Alliance) and Terminal 3 (other carriers). They are NOT connected airside — confirm your terminal", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "D", steps: [{ instruction: "Concourse D is directly past T1 security — Air Canada domestic", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
      { fromZone: "T1-security", toZone: "E", steps: [{ instruction: "Walk from T1 security to Concourse E — international flights including US transborder", mode: "walk", estimatedMinutes: 6, detail: "US pre-clearance is in Concourse E — allow extra time for US CBP" }], totalMinutes: 6 },
      { fromZone: "T1-security", toZone: "F", steps: [{ instruction: "Concourse F is connected to E — Air Canada long-haul international", mode: "walk", estimatedMinutes: 9 }], totalMinutes: 9 },
      { fromZone: "T3-security", toZone: "T3", steps: [{ instruction: "T3 gates are directly past security — WestJet, Air Transat, international charter", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
    ],
    generalNotes: "YYZ T1 has US customs pre-clearance — this adds 30+ min to your process. Plan for this if flying to the US. UP Express train connects YYZ to Union Station in 25 min.",
  },

  // ── Vancouver YVR ─────────────────────────────────────────────
  {
    iata: "YVR",
    name: "Vancouver",
    securityNotes: [
      { instruction: "YVR has a domestic and international terminal all within one building. After security follow signs for domestic (upper level) or international (lower level) gates", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "domestic", steps: [{ instruction: "Domestic gates are on the upper level — follow gate letter signs (A, B, C, D)", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "security", toZone: "international", steps: [{ instruction: "International gates are on the lower level — follow signs down from the main security hall", mode: "walk", estimatedMinutes: 6, detail: "US transborder also here — US customs pre-clearance in the terminal" }], totalMinutes: 6 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Concourse D is the farthest domestic concourse — walk along the main terminal hall", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
    ],
    generalNotes: "YVR is a beautiful airport with Indigenous art. Canada Line SkyTrain connects to downtown in 26 min. US flights clear customs at YVR before departure.",
  },

  // ── Mexico City MEX ───────────────────────────────────────────
  {
    iata: "MEX",
    name: "Mexico City Juárez",
    securityNotes: [
      { instruction: "MEX has Terminal 1 (main, most international) and Terminal 2 (Aeromexico hub). They are connected by a free SkyTrain", mode: "train", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 gates are directly past security — divided by domestic and international areas", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 Aeromexico hub gates are past security — all in one concourse", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T1", toZone: "T2", steps: [{ instruction: "Take the free SkyTrain between T1 and T2", detail: "Runs every 5 min, 4-min ride. Station is at the far end of T1", mode: "train", estimatedMinutes: 8 }], totalMinutes: 8 },
    ],
    generalNotes: "MEX is at high altitude (2,240m) — worth noting for connecting passengers feeling breathless. T2 is Aeromexico's hub and is more modern than T1.",
  },

  // ── São Paulo GRU ─────────────────────────────────────────────
  {
    iata: "GRU",
    name: "São Paulo Guarulhos",
    securityNotes: [
      { instruction: "GRU has Terminal 2 (T2) and Terminal 3 (T3). T3 is the main international terminal. Connected by internal walkway", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T3-security", toZone: "T3", steps: [{ instruction: "T3 gates are past security — large international departures hall with gates on both sides", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 gates are past security — domestic and regional flights", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3", toZone: "T2", steps: [{ instruction: "Walk from T3 to T2 via the connecting corridor at departure level", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
    ],
    generalNotes: "GRU T3 is the main international terminal. LATAM, Gol, and Azul are the dominant carriers. Allow 90 min for international departures.",
  },

  // ── Dubai DXB T2 (additional) ─────────────────────────────────
  // DXB T1/T3 already covered above

  // ── Doha Hamad DOH ────────────────────────────────────────────
  {
    iata: "DOH",
    name: "Doha Hamad",
    securityNotes: [
      { instruction: "DOH is a single ultra-modern terminal — all gates in one connected building after security. Qatar Airways hub. Look for concourse letters on boarding pass", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "security", toZone: "A", steps: [{ instruction: "Concourse A gates are directly past the main security checkpoint", mode: "walk", estimatedMinutes: 5, landmark: "The giant yellow teddy bear Lamp Bear sculpture marks the center" }], totalMinutes: 5 },
      { fromZone: "security", toZone: "B", steps: [{ instruction: "Walk from security through A to Concourse B", mode: "walk", estimatedMinutes: 8 }], totalMinutes: 8 },
      { fromZone: "security", toZone: "C", steps: [{ instruction: "Concourse C is connected via the main shopping corridor", mode: "walk", estimatedMinutes: 10 }], totalMinutes: 10 },
      { fromZone: "security", toZone: "D", steps: [{ instruction: "Take the airside people mover from the central terminal to Concourse D", mode: "train", estimatedMinutes: 8, detail: "Runs every 5 min — required for D concourse" }], totalMinutes: 8 },
      { fromZone: "security", toZone: "E", steps: [{ instruction: "Take the people mover to Concourse E", mode: "train", estimatedMinutes: 10 }], totalMinutes: 10 },
    ],
    generalNotes: "DOH is a luxurious Qatar Airways hub with an indoor pool, a 5-star hotel, and a full mall. Allow 90 min for international connections. The Oryx Airport Hotel is airside.",
  },

  // ── Abu Dhabi AUH ─────────────────────────────────────────────
  {
    iata: "AUH",
    name: "Abu Dhabi",
    securityNotes: [
      { instruction: "AUH has Terminal A (new, Etihad hub, opened 2024) and the older terminals. Terminal A is a single mega-terminal with all gates connected airside", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "TermA-security", toZone: "TermA", steps: [{ instruction: "Terminal A gates are past security in both directions — follow gate number signs", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "TermA-security", toZone: "far-gates", steps: [{ instruction: "Far gates in Terminal A require a walk of up to 15 min — take the internal moving walkways", mode: "walk", estimatedMinutes: 15, detail: "Moving walkways throughout Terminal A" }], totalMinutes: 15 },
    ],
    generalNotes: "AUH Terminal A opened in 2024 — one of the world's largest single-terminal buildings. US pre-clearance is available at AUH for flights to the US.",
  },

  // ── Mumbai BOM ────────────────────────────────────────────────
  {
    iata: "BOM",
    name: "Mumbai Chhatrapati Shivaji",
    securityNotes: [
      { instruction: "BOM has Terminal 1 (domestic, low-cost) and Terminal 2 (international + Air India domestic). T2 is a single modern building with all gates connected", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T2-security", toZone: "T2", steps: [{ instruction: "T2 gates are past security — all international and Air India domestic flights. Follow gate signs on the departure level", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T1-security", toZone: "T1", steps: [{ instruction: "T1 domestic gates are directly past security — IndiGo, SpiceJet, and other LCCs", mode: "walk", estimatedMinutes: 4 }], totalMinutes: 4 },
    ],
    generalNotes: "BOM T2 opened in 2014 and is modern with good food options. T1 is the older domestic terminal. Separate terminals — confirm which one before arriving.",
  },

  // ── Delhi DEL ─────────────────────────────────────────────────
  {
    iata: "DEL",
    name: "Delhi Indira Gandhi",
    securityNotes: [
      { instruction: "DEL has T1 (domestic LCC), T2 (now rarely used), and T3 (main terminal — international + Air India domestic). T3 is where most passengers go", mode: "walk", estimatedMinutes: 0 },
    ],
    concourseRoutes: [
      { fromZone: "T3-security", toZone: "T3-domestic", steps: [{ instruction: "T3 domestic gates are on Level 3 — follow 'Domestic Departures' signs after security", mode: "walk", estimatedMinutes: 5 }], totalMinutes: 5 },
      { fromZone: "T3-security", toZone: "T3-intl", steps: [{ instruction: "T3 international gates are on Level 3 opposite the domestic wing — follow 'International Departures'", mode: "walk", estimatedMinutes: 6 }], totalMinutes: 6 },
      { fromZone: "T3", toZone: "T1", steps: [{ instruction: "Free shuttle bus between T3 and T1 (for budget domestic carriers)", detail: "Runs every 20 min. Allow 30 min for the transfer", mode: "shuttle", estimatedMinutes: 30 }], totalMinutes: 30 },
    ],
    generalNotes: "DEL T3 is the main terminal — modern and large. IndiGo (India's largest carrier) uses T1 for most flights. Delhi Metro connects the airport to the city in 45 min.",
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

// ── Universal arrival guidance ────────────────────────────────────────────────
// Works for any airport even without specific data in the database.
// Apple approach: smart contextual guidance based on what we know.

export interface UniversalArrivalGuide {
  airportName: string;
  iata: string;
  hasSpecificData: boolean;
  baggage: {
    heading: string;
    steps: string[];
    walkMinutes: number;
  };
  exit: {
    heading: string;
    steps: string[];
  };
  rideshare: {
    heading: string;
    instructions: string;
  };
  tips: string[];
}

// Airline-specific baggage tips
const AIRLINE_BAGGAGE: Record<string, string> = {
  AS: "Alaska Airlines bags typically arrive within 20 min of landing.",
  AA: "American Airlines uses the central carousel hall — check screens for your flight number.",
  DL: "Delta bags are usually among the first off — Medallion bags tagged priority arrive first.",
  UA: "United Airlines — Premier bags arrive first on the carousel.",
  WN: "Southwest — no bag priority tiers, all bags go to the same carousel.",
  B6: "JetBlue — check the arrivals screen for your carousel number.",
  F9: "Frontier — bags may take 25–30 min, carousel posted on arrivals screen.",
  NK: "Spirit — bag claim can be slow, allow 30–35 min after landing.",
};

export function buildArrivalGuide(
  iata: string,
  airlineCode?: string,
  terminal?: string,
): UniversalArrivalGuide {
  const nav = getAirportNav(iata);
  const specific = nav?.arrivalInfo;
  const airlineTip = airlineCode ? AIRLINE_BAGGAGE[airlineCode.toUpperCase()] : undefined;

  // Use specific carousel data if available, otherwise build universal steps
  const carousel = specific?.baggageCarousels.find(c =>
    !c.terminal || !terminal || c.terminal.toLowerCase().includes(terminal.toLowerCase())
  ) ?? specific?.baggageCarousels[0];

  const baggageSteps = carousel
    ? [carousel.carouselNote]
    : [
        "After deplaning, do NOT exit to the street — stay inside and follow the 'Baggage Claim' signs.",
        "Take escalators or elevators DOWN to the baggage claim level.",
        "Find your flight on the carousel screen — it will show your carousel number.",
        "Wait at the carousel. If bags don't appear within 30 min, find the airline's baggage desk.",
      ];

  const exitSteps = specific?.exitDirections
    ? [specific.exitDirections]
    : [
        "After grabbing your bag, follow the green 'Exit / Ground Transportation' signs.",
        "Push through the one-way doors to the arrivals curb — you cannot re-enter once you exit.",
        "Rideshare pickup is usually marked with signs on pillars — look for 'Uber/Lyft' or 'App-Based Rides'.",
      ];

  const rideshareInstructions = specific?.groundTransport
    ?? "Open Uber or Lyft and select the airport pickup zone shown in the app. Follow signs on the curb pillars for 'App-Based Transportation' or 'TNC Pickup'. Do not get in unmarked cars — only board a vehicle whose plate matches your app.";

  const tips: string[] = [];
  if (airlineTip) tips.push(airlineTip);
  if (specific?.generalTip) tips.push(specific.generalTip);
  if (!specific) {
    tips.push("Keep your boarding pass accessible — some airports scan it at baggage claim exits.");
    tips.push("If your bag is damaged or missing, report it to the airline desk before leaving the baggage claim area.");
  }
  if (specific?.connectingFlight) tips.push("Connecting? " + specific.connectingFlight);

  return {
    airportName: nav?.name ?? iata,
    iata,
    hasSpecificData: Boolean(specific),
    baggage: {
      heading: "Baggage claim",
      steps: baggageSteps,
      walkMinutes: carousel?.walkMinutes ?? 8,
    },
    exit: {
      heading: "Getting out",
      steps: exitSteps,
    },
    rideshare: {
      heading: "Rideshare & transport",
      instructions: rideshareInstructions,
    },
    tips,
  };
}
