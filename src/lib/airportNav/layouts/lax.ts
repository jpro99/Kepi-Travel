/**
 * LAX (Los Angeles International) curated layout — airport #2.
 *
 * Built with the KEPI_DESIGN_LAW M29 new-airport playbook. LAX is NOT one
 * terminal: it is a horseshoe of independent terminals (T1, T2, T3, Tom Bradley/
 * TBIT, T4, T6, T7, T8) plus the West Gates (Midfield Satellite Concourse,
 * reached from TBIT by an underground pedestrian tunnel). Each terminal is a
 * self-contained curb → checkpoint → gates unit; you are dropped at YOUR
 * terminal, so routes are judged per-terminal (M29 nearest-curb backtrack rule).
 *
 * HONESTY TIERS (verify-first, rule 50):
 *  - SURVEYED (real OSM, Overpass 2026-07-14, `Map data © OpenStreetMap
 *    contributors`, ODbL): every gate-cluster centroid, every lounge, and the
 *    terminal footprints (./laxFootprints.ts). Gate clusters are the real
 *    centroid of that terminal's OSM `aeroway=gate` nodes.
 *  - ESTIMATE (Kepi-curated, clearly labeled): curbs sit at the real OSM terminal
 *    building centroid; security checkpoints are interpolated between curb and
 *    gates. OSM has NO checkpoint tagging (M15) and no curb/door refs for LAX,
 *    so these are best estimates — never presented as surveyed.
 *  - COVERAGE GAP: OSM currently has no Terminal 5 polygon or gates, so T5 is
 *    intentionally omitted rather than fabricated. Add it when OSM/ground truth
 *    is available.
 *
 * Inter-terminal walking follows the departures-level frontage (the horseshoe
 * sidewalk). The LAX Automated People Mover (APM) is not modeled yet.
 *
 * ARRIVALS (added 2026-08-21): TBIT customs/baggage claim + the two ground-
 * transport systems (LAX-it rideshare pickup, Terminal Connector shuttle) are
 * curated from LAX's own official PDFs, not travel-blog aggregation — see
 * `LAX_ARRIVALS_RESEARCH_MEMO.md`. These nodes are precision: "extrapolated"
 * (diagram-derived, no OSM ground truth exists for any of them) pending human
 * verification against the real terminal, same bar as everything else here.
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { LAX_OSM_FOOTPRINTS } from "./laxFootprints";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
const WALK_MPS = 1.25;
const walkSecs = (m: number) => Math.max(5, Math.round(m / WALK_MPS));

/**
 * Per-terminal verified geometry. `curb` = real OSM building centroid (landside
 * anchor). `gate` = real OSM gate-cluster centroid (SURVEYED). `secEntry`/
 * `secExit` = ESTIMATE, interpolated ~40/60% curb→gate.
 */
interface TerminalSpec {
  id: string;
  name: string;
  gateLabel: string;
  curb: [number, number];
  secEntry: [number, number];
  secExit: [number, number];
  gate: [number, number];
}

const TERMINALS: TerminalSpec[] = [
  // North arm (gates extend north of the frontage road).
  { id: "t1", name: "Terminal 1", gateLabel: "Terminal 1 gates (9–20)",
    curb: [-118.400801, 33.946380], secEntry: [-118.401025, 33.946598], secExit: [-118.401136, 33.946706], gate: [-118.401360, 33.946924] },
  { id: "t2", name: "Terminal 2", gateLabel: "Terminal 2 gates (21–28)",
    curb: [-118.404007, 33.946129], secEntry: [-118.404015, 33.946322], secExit: [-118.404018, 33.946419], gate: [-118.404026, 33.946612] },
  { id: "t3", name: "Terminal 3", gateLabel: "Terminal 3 gates (30–38)",
    curb: [-118.406739, 33.945805], secEntry: [-118.406975, 33.946019], secExit: [-118.407092, 33.946127], gate: [-118.407328, 33.946341] },
  // West curve — Tom Bradley International Terminal.
  { id: "tbit", name: "Tom Bradley International Terminal", gateLabel: "TBIT gates (130–159)",
    curb: [-118.409903, 33.942920], secEntry: [-118.410082, 33.943011], secExit: [-118.410172, 33.943056], gate: [-118.410351, 33.943147] },
  // South arm (gates extend south of the frontage road). T5 omitted (no OSM).
  { id: "t4", name: "Terminal 4", gateLabel: "Terminal 4 gates (40–49)",
    curb: [-118.406979, 33.941711], secEntry: [-118.407066, 33.941243], secExit: [-118.407110, 33.941009], gate: [-118.406761, 33.940540] },
  { id: "t6", name: "Terminal 6", gateLabel: "Terminal 6 gates (60–69)",
    curb: [-118.402001, 33.941800], secEntry: [-118.402005, 33.941516], secExit: [-118.402008, 33.941375], gate: [-118.402012, 33.941091] },
  { id: "t7", name: "Terminal 7", gateLabel: "Terminal 7 gates (70–79)",
    curb: [-118.399656, 33.941891], secEntry: [-118.399660, 33.941733], secExit: [-118.399661, 33.941654], gate: [-118.399665, 33.941496] },
  { id: "t8", name: "Terminal 8", gateLabel: "Terminal 8 gates (80–86)",
    curb: [-118.397657, 33.942421], secEntry: [-118.397587, 33.942229], secExit: [-118.397552, 33.942134], gate: [-118.397482, 33.941942] },
];

// West Gates (Midfield Satellite) — airside satellite reached from TBIT by the
// underground pedestrian tunnel. Real OSM gate centroid (SURVEYED).
const WEST_GATE: [number, number] = [-118.414412, 33.941113];

// Landside frontage walk order around the horseshoe (T5 skipped — no OSM).
const CURB_CHAIN = ["t1", "t2", "t3", "tbit", "t4", "t6", "t7", "t8"];

// Marquee lounges — real OSM coordinates (SURVEYED, Overpass 2026-07-14).
interface LoungeSpec { id: string; name: string; pos: [number, number]; hangOff: string; airline?: string; }
const LOUNGES: LoungeSpec[] = [
  { id: "lounge-centurion", name: "Amex Centurion Lounge (TBIT)", pos: [-118.409300, 33.942870], hangOff: "gate-tbit" },
  { id: "lounge-star", name: "Star Alliance Lounge (TBIT)", pos: [-118.409842, 33.942962], hangOff: "gate-tbit" },
  { id: "lounge-oneworld", name: "oneWorld Lounge (TBIT)", pos: [-118.409851, 33.942980], hangOff: "gate-tbit" },
  { id: "lounge-qantas", name: "Qantas First Lounge (TBIT)", pos: [-118.409930, 33.943730], hangOff: "gate-tbit" },
  { id: "lounge-admirals", name: "American Admirals Club (T4)", pos: [-118.410131, 33.941677], hangOff: "gate-t4", airline: "American" },
  { id: "lounge-united-club", name: "United Club (T7)", pos: [-118.400130, 33.942841], hangOff: "gate-t7", airline: "United" },
  { id: "lounge-polaris", name: "United Polaris Lounge (T7)", pos: [-118.399869, 33.941353], hangOff: "gate-t7", airline: "United" },
];

function buildLax(): { nodes: GraphNode[]; edges: GraphEdge[]; pois: PoiDefinition[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pois: PoiDefinition[] = [];
  const curbId = (t: string) => `curb-${t}`;

  for (const t of TERMINALS) {
    const secEntryId = `sec-${t.id}-entry`;
    const secExitId = `sec-${t.id}-exit`;
    const gateId = `gate-${t.id}`;

    nodes.push({ id: curbId(t.id), pos: t.curb, kind: "junction", airside: false, landmark: `${t.name} — ticketing & curb (drop-off)` });
    nodes.push({ id: secEntryId, pos: t.secEntry, kind: "security_entry", airside: false, landmark: `${t.name} security checkpoint` });
    nodes.push({ id: secExitId, pos: t.secExit, kind: "security_exit", airside: true, landmark: `${t.name} — past security` });
    nodes.push({ id: gateId, pos: t.gate, kind: "gate", airside: true, landmark: t.gateLabel });

    const curbToSec = metersBetween(t.curb, t.secEntry);
    edges.push({ id: `e-${t.id}-curb-sec`, from: curbId(t.id), to: secEntryId, kind: "walkway", lengthM: Math.max(15, curbToSec), traverseSeconds: walkSecs(Math.max(15, curbToSec)), bidirectional: true });
    edges.push({ id: `e-${t.id}-sec-std`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 13 * 60, bidirectional: false, laneType: "standard" });
    edges.push({ id: `e-${t.id}-sec-pre`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 6 * 60, bidirectional: false, laneType: "precheck" });
    const secToGate = metersBetween(t.secExit, t.gate);
    edges.push({ id: `e-${t.id}-sec-gate`, from: secExitId, to: gateId, kind: "walkway", lengthM: Math.max(15, secToGate), traverseSeconds: walkSecs(Math.max(15, secToGate)), bidirectional: true });

    pois.push({ id: `poi-gate-${t.id}`, nodeId: gateId, category: "gate", name: t.gateLabel, precision: "surveyed" });
    pois.push({
      id: `poi-sec-${t.id}`, nodeId: secEntryId, category: "security", name: `${t.name} security`,
      lanes: ["standard", "precheck"],
      notes: "Approximate location — LAX checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate inside the terminal toward the gates. Most terminals offer TSA PreCheck.",
    });
    pois.push({ id: `poi-checkin-${t.id}`, nodeId: curbId(t.id), category: "checkin", name: `${t.name} check-in`, precision: "schematic" });
  }

  // Landside frontage walk between adjacent terminals (departures-level sidewalk).
  for (let i = 0; i < CURB_CHAIN.length - 1; i += 1) {
    const a = TERMINALS.find((t) => t.id === CURB_CHAIN[i])!;
    const b = TERMINALS.find((t) => t.id === CURB_CHAIN[i + 1])!;
    const len = metersBetween(a.curb, b.curb);
    edges.push({ id: `e-frontage-${a.id}-${b.id}`, from: curbId(a.id), to: curbId(b.id), kind: "walkway", lengthM: len, traverseSeconds: walkSecs(len), bidirectional: true });
  }

  // West Gates satellite — airside tunnel from TBIT gates (moving walkways).
  nodes.push({ id: "gate-west", pos: WEST_GATE, kind: "gate", airside: true, landmark: "West Gates (201–235) · Midfield Satellite" });
  const tunnelLen = metersBetween([-118.410351, 33.943147], WEST_GATE);
  edges.push({ id: "e-tbit-west", from: "gate-tbit", to: "gate-west", kind: "moving_walkway", lengthM: tunnelLen, traverseSeconds: Math.round(tunnelLen / 1.0) + 120, bidirectional: true });
  pois.push({ id: "poi-gate-west", nodeId: "gate-west", category: "gate", name: "West Gates (201–235) · tunnel from TBIT", precision: "surveyed" });

  // Lounges — real OSM, hung off the nearest EXISTING airside node (checkpoint
  // exit or gate cluster) so the walk doesn't detour out to the gates and back.
  for (const l of LOUNGES) {
    nodes.push({ id: l.id, pos: l.pos, kind: "lounge", airside: true, landmark: l.name });
    const anchor = nodes
      .filter((n) => n.airside && (n.kind === "security_exit" || n.kind === "gate") && n.id.includes(l.hangOff.replace("gate-", "")))
      .concat(nodes.filter((n) => n.airside && n.kind === "gate" && n.id === l.hangOff))
      .sort((a, b) => metersBetween(a.pos, l.pos) - metersBetween(b.pos, l.pos))[0]
      ?? nodes.find((n) => n.id === l.hangOff)!;
    const len = metersBetween(anchor.pos, l.pos);
    edges.push({ id: `e-${anchor.id}-${l.id}`, from: anchor.id, to: l.id, kind: "walkway", lengthM: Math.max(15, len), traverseSeconds: walkSecs(Math.max(15, len)) + 30, bidirectional: true });
    pois.push({ id: `poi-${l.id}`, nodeId: l.id, category: "lounge", name: l.name, airline: l.airline, precision: "surveyed" });
  }

  // ── Arrivals (added 2026-08-21) — DRAFT, not yet human-verified ──
  // Sourced from LAX's own official public PDFs, read directly (not
  // aggregated from travel blogs — see LAX_ARRIVALS_RESEARCH_MEMO.md):
  //   - LAX Airline Location Map, flylax.com/media/6936, rev. SP26-0707
  //   - LAX Ground Transportation Waiting Areas map, flylax.com/media/1793,
  //     rev. SP26-0810
  // OSM has no ground truth for customs, baggage claim, or ground-transport
  // facilities, so every node below is precision: "extrapolated" (a
  // diagram-derived relative position, not a surveyed coordinate) until a
  // human confirms it against the real terminal — same bar as SEA (Decision
  // 2026-07-15). Scope: international arrivals (TBIT) + the two ground-
  // transport systems, which apply airport-wide. Per-terminal domestic
  // baggage claim is intentionally NOT modeled yet — "Level 1, standard
  // carousel" needs no special navigation help the way TBIT/LAX-it do.
  {
    const tbit = TERMINALS.find((t) => t.id === "tbit")!;
    const customsPos: [number, number] = [-118.4101, 33.94305];
    const baggagePos: [number, number] = [-118.40995, 33.94295];

    // customs-tbit stays airside (the sterile international-arrivals corridor,
    // same side of the border as the gate you deplaned at). baggage-tbit is
    // landside — clearing the CBP desk IS the crossing, so (per M31) that leg
    // must itself be a security_transition edge, not a plain walkway.
    nodes.push({ id: "customs-tbit", pos: customsPos, kind: "customs", airside: true, landmark: "TBIT customs & immigration (CBP) — 3rd floor" });
    nodes.push({ id: "baggage-tbit", pos: baggagePos, kind: "baggage_claim", airside: false, landmark: "TBIT international baggage claim — 1st floor" });

    const gateToCustomsM = metersBetween(tbit.gate, customsPos);
    const baggageToCurbM = metersBetween(baggagePos, tbit.curb);
    edges.push({ id: "e-tbit-gate-customs", from: "gate-tbit", to: "customs-tbit", kind: "walkway", lengthM: Math.max(15, gateToCustomsM), traverseSeconds: walkSecs(Math.max(15, gateToCustomsM)), bidirectional: false });
    // Wait time: secondary-source estimate (45–90 min at peak), not live data —
    // see LAX_ARRIVALS_RESEARCH_MEMO.md. Using the midpoint, honestly labeled.
    edges.push({ id: "e-tbit-customs-baggage", from: "customs-tbit", to: "baggage-tbit", kind: "security_transition", lengthM: 30, traverseSeconds: 60 * 60, bidirectional: false, laneType: "customs" });
    edges.push({ id: "e-tbit-baggage-curb", from: "baggage-tbit", to: curbId("tbit"), kind: "walkway", lengthM: Math.max(15, baggageToCurbM), traverseSeconds: walkSecs(Math.max(15, baggageToCurbM)), bidirectional: true });

    pois.push({
      id: "poi-customs-tbit", nodeId: "customs-tbit", category: "customs", name: "Customs & Immigration (CBP)",
      precision: "extrapolated",
      notes: "All LAX international arrivals process through TBIT regardless of which terminal you land at (confirmed on LAX's own airline map — e.g. Alaska/United international arrivals route through Terminal 6/B, 'confirm with airline'). Flow: 5th floor arrivals hall → 3rd floor CBP/immigration (Global Entry kiosks available) → 1st floor baggage claim. Typical wait 45–90 min at peak — secondary-source estimate, not a live number.",
    });
    pois.push({
      id: "poi-baggage-tbit", nodeId: "baggage-tbit", category: "baggage", name: "TBIT international baggage claim",
      precision: "extrapolated",
      notes: "Known exceptions from LAX's own airline map — not the default case: Aer Lingus/Flair arrive at TBIT and WALK to Terminal 4 for bags. Frontier/Sun Country/Cayman Airways/Viva Aerobus check in at Terminal 1, are bused to TBIT to arrive/depart, then bused BACK to Terminal 1 for baggage claim.",
    });

    // Ground transportation — three distinct systems per LAX's own Ground
    // Transportation Waiting Areas map. Do not collapse into one "curb
    // pickup" — that conflation is the error every secondary source made.
    const t1 = TERMINALS.find((t) => t.id === "t1")!;
    const laxItPos: [number, number] = [-118.397, 33.9458];
    nodes.push({ id: "ground-laxit", pos: laxItPos, kind: "ground_transport", airside: false, landmark: "LAX-it — Uber/Lyft/Prime Time/taxi pickup" });
    const t1ToLaxItM = metersBetween(t1.curb, laxItPos);
    const baggageToLaxItM = metersBetween(baggagePos, laxItPos);
    edges.push({ id: "e-t1-laxit", from: curbId("t1"), to: "ground-laxit", kind: "walkway", lengthM: Math.max(15, t1ToLaxItM), traverseSeconds: Math.max(walkSecs(t1ToLaxItM), 3 * 60), bidirectional: true });
    edges.push({ id: "e-tbit-baggage-laxit", from: "baggage-tbit", to: "ground-laxit", kind: "walkway", lengthM: Math.max(15, baggageToLaxItM), traverseSeconds: Math.max(walkSecs(baggageToLaxItM), 8 * 60), bidirectional: true });

    pois.push({
      id: "poi-laxit", nodeId: "ground-laxit", category: "ground_transport", name: "LAX-it — Uber, Lyft, Prime Time, taxi",
      precision: "extrapolated",
      notes: "Consolidated rideshare/taxi pickup for ALL terminals, reached by the green-marked walking path along your terminal's arrivals-level frontage, or the free shuttle (stops every 3–5 min just outside baggage claim). Request your ride once you arrive; you'll get a zone number and the driver confirms via a PIN in-app. Walk time varies by terminal: ~3–8 min from Terminal 1/7, ~19 min from Terminal 4/5 (LAX's own published estimate). Pickup only — not for drop-off.",
    });

    // Terminal Connector / Metro Connector (pink) — SEPARATE from LAX-it:
    // inter-terminal transfer + parking/employee lots. Hung off each
    // terminal's existing curb node — no new geometry required.
    for (const t of TERMINALS) {
      pois.push({
        id: `poi-connector-${t.id}`, nodeId: curbId(t.id), category: "ground_transport",
        name: "Terminal Connector shuttle (parking/inter-terminal — not rideshare)",
        precision: "schematic",
        notes: "Pink-signed stop, runs ~every 10 min. For parking lots, employee lots, and terminal-to-terminal transfer only — NOT for Uber/Lyft/taxi (use LAX-it instead). A yellow taxi icon also appears at some individual terminal frontages on LAX's own map, suggesting curbside taxi may be available outside the LAX-it queue too — unconfirmed, needs an on-the-ground check.",
      });
    }
  }

  return { nodes, edges, pois };
}

const BUILT = buildLax();

const ZONES: TerminalZonePolygon[] = [
  { id: "z-t1", name: "Terminal 1", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal1 },
  { id: "z-t2", name: "Terminal 2", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal2 },
  { id: "z-t3", name: "Terminal 3", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal3 },
  { id: "z-tbit", name: "Tom Bradley International Terminal", airside: false, heightM: 18, ring: LAX_OSM_FOOTPRINTS.tbit },
  { id: "z-west", name: "West Gates (Midfield Satellite)", airside: true, heightM: 16, ring: LAX_OSM_FOOTPRINTS.westGates },
  { id: "z-t4", name: "Terminal 4", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal4 },
  { id: "z-t6", name: "Terminal 6", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal6 },
  { id: "z-t7", name: "Terminal 7", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal7 },
  { id: "z-t8", name: "Terminal 8", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal8 },
];

export const LAX_LAYOUT: AirportLayout = {
  iata: "LAX",
  name: "Los Angeles International",
  layoutVersion: "0.2.0-arrivals-draft",
  updatedAt: "2026-08-21",
  center: [-118.40853, 33.94254],
  zones: ZONES,
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: [
    { prefix: "9", nodeId: "gate-t1" },
    { prefix: "11", nodeId: "gate-t1" }, { prefix: "12", nodeId: "gate-t1" }, { prefix: "13", nodeId: "gate-t1" },
    { prefix: "14", nodeId: "gate-t1" }, { prefix: "15", nodeId: "gate-t1" }, { prefix: "16", nodeId: "gate-t1" },
    { prefix: "17", nodeId: "gate-t1" }, { prefix: "18", nodeId: "gate-t1" }, { prefix: "20", nodeId: "gate-t1" },
    { prefix: "21", nodeId: "gate-t2" }, { prefix: "22", nodeId: "gate-t2" }, { prefix: "23", nodeId: "gate-t2" },
    { prefix: "24", nodeId: "gate-t2" }, { prefix: "25", nodeId: "gate-t2" }, { prefix: "26", nodeId: "gate-t2" },
    { prefix: "27", nodeId: "gate-t2" }, { prefix: "28", nodeId: "gate-t2" },
    { prefix: "30", nodeId: "gate-t3" }, { prefix: "31", nodeId: "gate-t3" }, { prefix: "32", nodeId: "gate-t3" },
    { prefix: "33", nodeId: "gate-t3" }, { prefix: "34", nodeId: "gate-t3" }, { prefix: "35", nodeId: "gate-t3" },
    { prefix: "36", nodeId: "gate-t3" }, { prefix: "37", nodeId: "gate-t3" }, { prefix: "38", nodeId: "gate-t3" },
    { prefix: "40", nodeId: "gate-t4" }, { prefix: "41", nodeId: "gate-t4" }, { prefix: "42", nodeId: "gate-t4" },
    { prefix: "46", nodeId: "gate-t4" }, { prefix: "48", nodeId: "gate-t4" }, { prefix: "49", nodeId: "gate-t4" },
    { prefix: "60", nodeId: "gate-t6" }, { prefix: "61", nodeId: "gate-t6" }, { prefix: "62", nodeId: "gate-t6" },
    { prefix: "63", nodeId: "gate-t6" }, { prefix: "64", nodeId: "gate-t6" }, { prefix: "65", nodeId: "gate-t6" },
    { prefix: "66", nodeId: "gate-t6" }, { prefix: "67", nodeId: "gate-t6" }, { prefix: "68", nodeId: "gate-t6" },
    { prefix: "69", nodeId: "gate-t6" },
    { prefix: "70", nodeId: "gate-t7" }, { prefix: "71", nodeId: "gate-t7" }, { prefix: "72", nodeId: "gate-t7" },
    { prefix: "73", nodeId: "gate-t7" }, { prefix: "74", nodeId: "gate-t7" }, { prefix: "75", nodeId: "gate-t7" },
    { prefix: "76", nodeId: "gate-t7" }, { prefix: "77", nodeId: "gate-t7" },
    { prefix: "80", nodeId: "gate-t8" }, { prefix: "81", nodeId: "gate-t8" }, { prefix: "82", nodeId: "gate-t8" },
    { prefix: "83", nodeId: "gate-t8" }, { prefix: "84", nodeId: "gate-t8" }, { prefix: "85", nodeId: "gate-t8" },
    { prefix: "86", nodeId: "gate-t8" },
    // TBIT (130–159) — 3-digit prefixes win over the 2-digit T1/T3 ones above.
    { prefix: "130", nodeId: "gate-tbit" }, { prefix: "131", nodeId: "gate-tbit" }, { prefix: "132", nodeId: "gate-tbit" },
    { prefix: "133", nodeId: "gate-tbit" }, { prefix: "134", nodeId: "gate-tbit" }, { prefix: "135", nodeId: "gate-tbit" },
    { prefix: "137", nodeId: "gate-tbit" }, { prefix: "139", nodeId: "gate-tbit" }, { prefix: "141", nodeId: "gate-tbit" },
    { prefix: "148", nodeId: "gate-tbit" }, { prefix: "150", nodeId: "gate-tbit" }, { prefix: "151", nodeId: "gate-tbit" },
    { prefix: "152", nodeId: "gate-tbit" }, { prefix: "153", nodeId: "gate-tbit" }, { prefix: "154", nodeId: "gate-tbit" },
    { prefix: "155", nodeId: "gate-tbit" }, { prefix: "156", nodeId: "gate-tbit" }, { prefix: "157", nodeId: "gate-tbit" },
    { prefix: "159", nodeId: "gate-tbit" },
    // West Gates (201–235).
    { prefix: "201", nodeId: "gate-west" }, { prefix: "203", nodeId: "gate-west" }, { prefix: "205", nodeId: "gate-west" },
    { prefix: "207", nodeId: "gate-west" }, { prefix: "221", nodeId: "gate-west" }, { prefix: "225", nodeId: "gate-west" },
    { prefix: "227", nodeId: "gate-west" }, { prefix: "229", nodeId: "gate-west" }, { prefix: "230", nodeId: "gate-west" },
    { prefix: "231", nodeId: "gate-west" }, { prefix: "232", nodeId: "gate-west" }, { prefix: "233", nodeId: "gate-west" },
    { prefix: "235", nodeId: "gate-west" },
  ],
};
