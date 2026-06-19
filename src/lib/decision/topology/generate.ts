import { allocateStopDates } from "@/lib/decision/stopDates";
import { formatStopRoute } from "@/lib/decision/stopDates";
import { resolvePrimaryOrigin } from "@/lib/decision/tripOrigins";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { estimateGroundConnector } from "@/lib/decision/topology/groundConnectors";
import type { TopologyFlightLeg, TripTopologyCandidate, TopologyKind } from "@/lib/decision/topology/types";

function isSoCalOrigin(iata: string): boolean {
  return ["LAX", "ONT", "SNA", "BUR", "SAN"].includes(iata.toUpperCase());
}

function prefersAlaska(intent: TripIntent): boolean {
  return (
    intent.preferredAirlines?.includes("Alaska") ||
    intent.loyaltyPrograms?.some((p) => /alaska/i.test(p)) ||
    false
  );
}

function pickRepositionHub(origin: string, intent: TripIntent): string | null {
  const upper = origin.toUpperCase();
  if (prefersAlaska(intent) && upper !== "SEA") return "SEA";
  if (isSoCalOrigin(upper) && upper !== "SEA") return "SEA";
  if (upper === "ONT" || upper === "SNA") return "LAX";
  return null;
}

function longHaulEstimateUsd(origin: string, dest: string): number {
  const us = ["LAX", "ONT", "SNA", "SEA", "SFO", "JFK", "ORD", "DFW", "ATL", "MIA", "HNL"];
  const europe = ["FCO", "BRI", "VCE", "MXP", "FLR", "MUC", "FRA", "CDG", "LHR", "AMS"];
  const o = origin.toUpperCase();
  const d = dest.toUpperCase();
  if (us.includes(o) && europe.includes(d)) return 780;
  if (us.includes(d) && europe.includes(o)) return 780;
  return 650;
}

function feederEstimateUsd(): number {
  return 120;
}

function candidateId(parts: string[]): string {
  return parts.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function buildFlightLegs(input: {
  home: string;
  homeLabel: string;
  arrive: string;
  arriveLabel: string;
  returnFrom: string;
  returnLabel: string;
  startDate: string;
  endDate: string;
  includeConnectors: boolean;
  connectorMode: "flight" | "ground";
  intent: TripIntent;
  feeder?: { hub: string; hubLabel: string; pricing: "cash_live" | "award_estimate" };
}): { flightLegs: TopologyFlightLeg[]; groundLegs: TripTopologyCandidate["groundLegs"]; friction: number } {
  const flightLegs: TopologyFlightLeg[] = [];
  const groundLegs: TripTopologyCandidate["groundLegs"] = [];
  let friction = 20;

  if (input.feeder) {
    flightLegs.push({
      id: "feeder",
      role: "feeder",
      fromIata: input.home,
      toIata: input.feeder.hub,
      fromLabel: input.homeLabel,
      toLabel: input.feeder.hubLabel,
      departureDate: input.startDate,
      pricing: "cash_live",
    });
    flightLegs.push({
      id: "longhaul-out",
      role: "longhaul",
      fromIata: input.feeder.hub,
      toIata: input.arrive,
      fromLabel: input.feeder.hubLabel,
      toLabel: input.arriveLabel,
      departureDate: input.startDate,
      pricing: input.feeder.pricing,
    });
    friction += 90;
  } else {
    flightLegs.push({
      id: "outbound",
      role: "outbound",
      fromIata: input.home,
      toIata: input.arrive,
      fromLabel: input.homeLabel,
      toLabel: input.arriveLabel,
      departureDate: input.startDate,
      pricing: "cash_live",
    });
  }

  if (input.includeConnectors) {
    const stops = input.intent.stops ?? [];
    const stopDates = allocateStopDates(input.intent);
    for (let i = 0; i < stops.length - 1; i += 1) {
      const from = stops[i]!;
      const to = stops[i + 1]!;
      if (!from.iata || !to.iata) continue;
      const depart = stopDates[i]?.checkOut ?? input.startDate;
      if (input.connectorMode === "ground") {
        const ground = estimateGroundConnector(from.iata, to.iata, from.name, to.name);
        if (ground) {
          groundLegs.push({
            id: `ground-${i}`,
            label: ground.label,
            detail: ground.detail,
            costUsd: ground.costUsd,
          });
          friction += ground.frictionMinutes;
          continue;
        }
      }
      flightLegs.push({
        id: `connector-${i}`,
        role: "connector",
        fromIata: from.iata.toUpperCase(),
        toIata: to.iata.toUpperCase(),
        fromLabel: from.name,
        toLabel: to.name,
        departureDate: depart,
        pricing: "cash_live",
      });
      friction += 45;
    }
  }

  flightLegs.push({
    id: "return",
    role: "return",
    fromIata: input.returnFrom,
    toIata: input.home,
    fromLabel: input.returnLabel,
    toLabel: input.homeLabel,
    departureDate: input.endDate,
    pricing: "cash_live",
  });

  return { flightLegs, groundLegs, friction };
}

function pushCandidate(
  out: TripTopologyCandidate[],
  seen: Set<string>,
  candidate: TripTopologyCandidate,
): void {
  const key = `${candidate.kind}:${candidate.homeAirport}:${candidate.arrivalAirport}:${candidate.returnAirport}:${candidate.flightLegs.map((l) => l.id).join(",")}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(candidate);
}

/**
 * Generates trip topology candidates — structural shapes Google never searches as one unit.
 */
export function generateTopologyCandidates(
  intent: TripIntent,
  genome: TravelerGenome,
  searchAirports: string[],
): TripTopologyCandidate[] {
  const primaryHome = resolvePrimaryOrigin(intent, genome);
  if (!primaryHome) return [];

  const origins = [...new Set([primaryHome, ...searchAirports.map((c) => c.toUpperCase())])].slice(0, 5);
  const stops = intent.stops ?? [];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const arriveIata = (firstStop?.iata ?? intent.destinationIata).toUpperCase();
  const returnIata = (intent.returnAirports?.[0] ?? lastStop?.iata ?? intent.destinationIata).toUpperCase();
  const naiveReturnIata = arriveIata;
  const homeLabel = intent.originCity ?? primaryHome;
  const arriveLabel = firstStop?.name ?? intent.destination;
  const returnLabel = intent.returnCity ?? lastStop?.name ?? intent.destination;
  const routeLabel = stops.length > 0 ? formatStopRoute(stops) : intent.destination;
  const isMulti = stops.length > 1;

  const out: TripTopologyCandidate[] = [];
  const seen = new Set<string>();

  const addOpenJaw = (
    home: string,
    returnFrom: string,
    kind: TopologyKind,
    wave: number,
    title: string,
    savingsDna: string,
    connectorMode: "flight" | "ground",
    feeder?: { hub: string; hubLabel: string; pricing: "cash_live" | "award_estimate" },
  ): void => {
    const { flightLegs, groundLegs, friction } = buildFlightLegs({
      home,
      homeLabel: home === primaryHome ? homeLabel : home,
      arrive: arriveIata,
      arriveLabel,
      returnFrom,
      returnLabel: returnFrom === returnIata ? returnLabel : returnFrom,
      startDate: intent.startDate,
      endDate: intent.endDate,
      includeConnectors: isMulti,
      connectorMode,
      intent,
      feeder,
    });
    const est =
      (feeder ? feederEstimateUsd() + longHaulEstimateUsd(flightLegs.find((l) => l.role === "longhaul")?.fromIata ?? home, arriveIata) : longHaulEstimateUsd(home, arriveIata)) +
      longHaulEstimateUsd(returnFrom, home) +
      groundLegs.reduce((s, g) => s + g.costUsd, 0) +
      (connectorMode === "flight" ? (stops.length - 1) * 95 : 0);

    pushCandidate(out, seen, {
      id: candidateId([kind, home, arriveIata, returnFrom, connectorMode, feeder?.hub ?? "direct"]),
      kind,
      title,
      headline: `${home} → ${arriveLabel}${isMulti ? ` · ${routeLabel}` : ""} · home from ${returnFrom}`,
      reasoning: savingsDna,
      savingsDna,
      flightLegs,
      groundLegs,
      frictionMinutes: friction,
      wave,
      estimateLowerBoundUsd: Math.round(est),
      homeAirport: home,
      arrivalAirport: arriveIata,
      returnAirport: returnFrom,
    });
  };

  // Wave 0 — naive baseline (what Google defaults to if you don't know open-jaw)
  for (const home of origins.slice(0, 2)) {
    const { flightLegs, groundLegs, friction } = buildFlightLegs({
      home,
      homeLabel: home === primaryHome ? homeLabel : home,
      arrive: arriveIata,
      arriveLabel,
      returnFrom: naiveReturnIata,
      returnLabel: arriveLabel,
      startDate: intent.startDate,
      endDate: intent.endDate,
      includeConnectors: false,
      connectorMode: "flight",
      intent,
    });
    const est = longHaulEstimateUsd(home, arriveIata) * 2;
    pushCandidate(out, seen, {
      id: candidateId(["naive", home, arriveIata]),
      kind: "naive_roundtrip",
      title: "Simple round-trip",
      headline: `${home} ↔ ${arriveLabel} · round-trip (Google default)`,
      reasoning: "The fare most travelers search first — fly into and out of the same city.",
      savingsDna: "Baseline — round-trip to first city only; ignores open-jaw and extra stops.",
      flightLegs,
      groundLegs,
      frictionMinutes: friction,
      wave: 0,
      estimateLowerBoundUsd: Math.round(est),
      homeAirport: home,
      arrivalAirport: arriveIata,
      returnAirport: naiveReturnIata,
    });
  }

  // Wave 1 — open-jaw (intent-native)
  if (returnIata !== arriveIata || isMulti) {
    addOpenJaw(
      primaryHome,
      returnIata,
      "open_jaw",
      1,
      "Open-jaw routing",
      "Fly into the first city, home from the last — avoids backtracking across your route.",
      "flight",
    );
    addOpenJaw(
      primaryHome,
      returnIata,
      "ground_connector",
      1,
      "Open-jaw + trains",
      "Same open-jaw, but European legs by train — often beats short-hop flights.",
      "ground",
    );
  }

  // Wave 2 — gateway sweep (alternate home airports)
  for (const home of origins) {
    if (home === primaryHome) continue;
    addOpenJaw(
      home,
      returnIata,
      "gateway_sweep",
      2,
      `Gateway via ${home}`,
      `Alternate departure airport ${home} — metro areas often hide a cheaper long-haul.`,
      "flight",
    );
  }

  // Wave 2 — return sweep
  const returnOptions = [...new Set([returnIata, ...(intent.returnAirports ?? []).map((c) => c.toUpperCase()), lastStop?.iata?.toUpperCase()].filter(Boolean) as string[])];
  for (const ret of returnOptions) {
    if (ret === naiveReturnIata) continue;
    addOpenJaw(
      primaryHome,
      ret,
      "return_sweep",
      2,
      `Return from ${ret}`,
      `Open-jaw with return from ${ret} instead of ${naiveReturnIata}.`,
      "flight",
    );
  }

  // Wave 3 — positioning hub (feeder + long-haul)
  const hub = pickRepositionHub(primaryHome, intent);
  if (hub && hub !== primaryHome && genome.toleratesRepositioning !== false) {
    addOpenJaw(primaryHome, returnIata, "position_cash", 3, `Position via ${hub}`, `Feeder to ${hub} then long-haul — unlocks partner fares and award space.`, "flight", {
      hub,
      hubLabel: hub,
      pricing: "cash_live",
    });
    addOpenJaw(primaryHome, returnIata, "position_award", 3, `Position + award via ${hub}`, `Cash feeder to ${hub}, partner award long-haul — expert play when miles beat cash.`, "flight", {
      hub,
      hubLabel: hub,
      pricing: "award_estimate",
    });
  }

  return out.sort((a, b) => a.wave - b.wave || a.estimateLowerBoundUsd - b.estimateLowerBoundUsd);
}
