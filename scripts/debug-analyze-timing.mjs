/**
 * One-off timing probe for Trip Planner analyze pipeline.
 * Usage: node --import tsx scripts/debug-analyze-timing.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const { buildDecisionBrief } = await import("../src/lib/decision/strategyEngine.ts");
const { runKepiWaveSearch } = await import("../src/lib/decision/topology/waveSearch.ts");
const { runFusedSearchForTrip } = await import("../src/lib/flights/fusedFlightSearch.ts");
const { searchDuffelCashQuotes } = await import("../src/lib/providers/duffel/flightOffers.ts");
const { enabledConnectorLegs } = await import("../src/lib/decision/flightLegPlanner.ts");
const { createSampleGenome } = await import("../src/lib/traveler/sampleGenome.ts");

const PROMPT = process.argv[2] ?? "Beaumont California to Italy in September";
const userId = "debug-analyze-timing";

function log(phase, extra = {}) {
  console.log(JSON.stringify({ ts: Date.now(), phase, ...extra }));
}

async function timed(label, fn) {
  const start = Date.now();
  log(`${label}:start`);
  try {
    const result = await fn();
    log(`${label}:done`, { ms: Date.now() - start });
    return result;
  } catch (error) {
    log(`${label}:error`, {
      ms: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

log("analyze:start", { prompt: PROMPT });

const genome = createSampleGenome(userId);
const brief = buildDecisionBrief(PROMPT, genome, { planMode: "full", comfortWeight: 0.55 });

log("brief:built", {
  ms: 0,
  searchAirports: brief.searchAirports,
  originRequired: brief.originRequired,
  strategyCount: brief.strategies.length,
});

if (brief.originRequired || brief.searchAirports.length === 0) {
  log("analyze:abort", { reason: "originRequired or no search airports" });
  process.exit(0);
}

const [topologySearch, fusedFlightSearch] = await Promise.all([
  timed("runKepiWaveSearch", () => runKepiWaveSearch(brief.intent, genome, brief.searchAirports)),
  timed("runFusedSearchForTrip", () => runFusedSearchForTrip(brief.intent, brief.searchAirports, genome, userId)),
]);

log("parallel:summary", {
  duffelCallsUsed: topologySearch.duffelCallsUsed,
  seatsAeroCallsUsed: topologySearch.seatsAeroCallsUsed,
  candidatesGenerated: topologySearch.candidatesGenerated,
  fusedCash: fusedFlightSearch?.cashOffers.length ?? 0,
  fusedAward: fusedFlightSearch?.awardOffers.length ?? 0,
});

const arrivalIata = brief.intent.stops?.[0]?.iata ?? brief.intent.destinationIata;
const outboundDuffel = await timed("outboundDuffel", () =>
  searchDuffelCashQuotes({
    origins: brief.searchAirports,
    destination: arrivalIata,
    departureDate: brief.intent.startDate,
  }),
);

let returnDuffel;
const homeIata = brief.searchAirports[0];
if (brief.intent.returnAirports?.length && homeIata) {
  returnDuffel = await timed("returnDuffel", () =>
    searchDuffelCashQuotes({
      origins: brief.intent.returnAirports,
      destination: homeIata,
      departureDate: brief.intent.endDate,
    }),
  );
}

const connectorLegs = enabledConnectorLegs(brief.flightLegs ?? []);
const connectorDuffel = await timed("connectorDuffel", () =>
  Promise.all(
    connectorLegs.map(async (leg) => ({
      legId: leg.id,
      result: await searchDuffelCashQuotes({
        origins: [leg.fromIata],
        destination: leg.toIata,
        departureDate: leg.departureDate,
      }),
    })),
  ),
);

log("analyze:complete", {
  outboundQuotes: outboundDuffel.quotes.length,
  returnQuotes: returnDuffel?.quotes.length ?? 0,
  connectorLegs: connectorLegs.length,
});
