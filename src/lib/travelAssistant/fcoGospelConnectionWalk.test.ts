import assert from "node:assert/strict";
import test from "node:test";

import { resolveHubConnection } from "@/lib/airportNav/connectionClock";
import { buildConnectionPlaybook } from "@/lib/travelAssistant/connectionPlaybook";
import {
  FCO_CONNECTION_SEP_12_RESERVATIONS,
  FCO_INTL_CONNECTION_RESERVATIONS,
} from "@/lib/travelAssistant/fixtures/fcoConnectionSep12Fixture";
import {
  buildFcoGospelConnectionWalk,
  buildFcoHubConnectionContext,
  fcoPackageSupportsGospelConnectionWalk,
} from "@/lib/travelAssistant/fcoGospelConnectionWalk";
import { resolveAirportSpotlightForHome } from "@/lib/travelAssistant/airportSpotlightContext";

const SEP_12_FCO_CONNECTION_WINDOW = Date.parse("2026-09-12T09:30:00.000Z");

test("FCO signed package is sufficient for gospel connection walk", () => {
  assert.equal(fcoPackageSupportsGospelConnectionWalk(), true);
});

test("Z84T4Z BRI→FCO→VCE: gospel walk shows Unknown gate, no invented gate string", () => {
  const reservations = [...FCO_CONNECTION_SEP_12_RESERVATIONS];
  const ctx = buildFcoHubConnectionContext(reservations[0]!, reservations[1]!, "FCO");
  assert.ok(ctx);

  const steps = buildFcoGospelConnectionWalk({ ctx: ctx! });
  const gate = steps.find((s) => s.id === "gate");
  assert.ok(gate);
  assert.match(gate!.text, /Unknown/i);
  assert.doesNotMatch(JSON.stringify(steps), /Gate [A-Z]\d+/i);
  assert.doesNotMatch(gate!.detail ?? "", /predicted|historical|Flighty/i);

  const immigration = steps.find((s) => s.id === "immigration");
  assert.equal(immigration, undefined, "domestic Schengen inbound skips passport");

  assert.ok(steps.every((s) => s.provenance.startsWith("official:") || s.provenance.startsWith("package:")));
});

test("JFK→FCO intl inbound: passport step cites package + official EU lane text only", () => {
  const reservations = [...FCO_INTL_CONNECTION_RESERVATIONS];
  const ctx = buildFcoHubConnectionContext(reservations[0]!, reservations[1]!, "FCO");
  assert.ok(ctx);

  const steps = buildFcoGospelConnectionWalk({ ctx: ctx! });
  const immigration = steps.find((s) => s.id === "immigration");
  assert.ok(immigration);
  assert.match(immigration!.provenance, /package:poi-passport-t3/);
  assert.match(immigration!.provenance, /official:customsTip/);
  assert.match(immigration!.detail ?? "", /EU\/EEA passport holders use the EU lane/i);
  assert.doesNotMatch(immigration!.detail ?? "", /e-gates if eligible/i);
});

test("buildConnectionPlaybook at FCO uses gospel steps for Sep 12 connector fixture", () => {
  const playbook = buildConnectionPlaybook(
    [...FCO_CONNECTION_SEP_12_RESERVATIONS],
    SEP_12_FCO_CONNECTION_WINDOW,
    { requireActiveWindow: false },
  );
  assert.ok(playbook);
  assert.equal(playbook!.hubIata, "FCO");
  const gate = playbook!.steps.find((s) => s.id === "gate");
  assert.ok(gate);
  assert.match(gate!.text, /Unknown/i);
});

test("resolveHubConnection + gospel: FCO hub resolves for outbound AZ1467", () => {
  const ctx = resolveHubConnection(
    [...FCO_CONNECTION_SEP_12_RESERVATIONS],
    "FCO",
    "z84-fco-vce",
    SEP_12_FCO_CONNECTION_WINDOW,
  );
  assert.ok(ctx);
  assert.equal(ctx!.outbound.flightNumber, "AZ1467");
  const gospel = buildFcoGospelConnectionWalk({ ctx: ctx! });
  assert.ok(gospel.some((s) => s.id === "deplane"));
  assert.ok(gospel.some((s) => s.id === "gate" && /Unknown/i.test(s.text)));
});

test("Home spotlight during FCO connection surfaces gospel step, not generic e-gates", () => {
  const spotlight = resolveAirportSpotlightForHome({
    journeyPhase: {
      kind: "just-landed",
      flight: {
        id: "z84-bri-fco",
        type: "flight",
        flightArrivalAirport: "FCO",
        flightDepartureAirport: "BRI",
        flightArrivalTime: "2026-09-12 11:15",
        timezone: "Europe/Rome",
      },
      landedMinutesAgo: 8,
    } as never,
    locationStatus: "at-airport",
    reservations: [...FCO_CONNECTION_SEP_12_RESERVATIONS],
    nextFlight: {
      id: "z84-fco-vce",
      type: "flight",
      flightDepartureAirport: "FCO",
      flightDepartureTime: "2026-09-12 12:00",
      timezone: "Europe/Rome",
    } as never,
    nowMs: SEP_12_FCO_CONNECTION_WINDOW,
  });
  assert.ok(spotlight);
  assert.doesNotMatch(spotlight!.detail ?? "", /e-gates if eligible/i);
  assert.doesNotMatch(spotlight!.title ?? "", /Gate [A-Z]\d+/i);
});

test("booked gate on confirmation resolves package provenance when joined to graph", () => {
  const reservations = [
    { ...FCO_CONNECTION_SEP_12_RESERVATIONS[0]! },
    {
      ...FCO_CONNECTION_SEP_12_RESERVATIONS[1]!,
      flightDepartureGate: "E12",
    },
  ];
  const ctx = buildFcoHubConnectionContext(reservations[0]!, reservations[1]!, "FCO");
  assert.ok(ctx);
  const steps = buildFcoGospelConnectionWalk({
    ctx: ctx!,
    gateSources: { bookedGate: "E12", departureIata: "FCO" },
  });
  const gate = steps.find((s) => s.id === "gate");
  assert.ok(gate);
  assert.match(gate!.text, /Gate E12/i);
  assert.match(gate!.provenance, /^package:gate-e$/);
});
