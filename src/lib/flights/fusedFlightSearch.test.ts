import test from "node:test";
import assert from "node:assert/strict";
import { buildOriginAwardLeaderboard } from "./fusedFlightSearch";
import { getProgramValuations } from "./cppValuations";
import type { AwardOffer, CashOffer, FlightSegment } from "./types";

function segment(origin: string, destination: string): FlightSegment {
  return {
    origin,
    destination,
    departingAt: "2026-09-08T10:00:00Z",
    arrivingAt: "2026-09-08T20:00:00Z",
    marketingCarrier: "AS",
    flightNumber: "AS123",
  };
}

function award(
  searchOrigin: string,
  program: AwardOffer["program"],
  milesCost: number,
  overrides: Partial<AwardOffer> = {},
): AwardOffer & { searchOrigin: string } {
  return {
    kind: "award",
    id: `${searchOrigin}-${program}-${milesCost}`,
    program,
    milesCost,
    cashSurcharge: 0,
    currency: "USD",
    cabin: "economy",
    segments: [segment(searchOrigin, "FCO")],
    source: "seats_aero",
    searchOrigin,
    ...overrides,
  };
}

const NO_FEEDER = new Map<string, number>();

test("buildOriginAwardLeaderboard picks the cheapest cash-equivalent, not the fewest raw miles", async () => {
  const valuations = await getProgramValuations();
  // Alaska: 25,000mi @ 1.5c/pt = $375 cash-equivalent.
  // Chase UR: 20,000mi @ 2.0c/pt = $400 cash-equivalent — fewer miles, but worse value.
  const offers = [award("ONT", "alaska", 25_000), award("ONT", "chase_ur", 20_000)];
  const board = buildOriginAwardLeaderboard(offers, [], "economy", "2026-09-08", ["ONT"], valuations, NO_FEEDER, "ONT");
  assert.equal(board.length, 1);
  assert.equal(board[0]?.program, "alaska");
  assert.equal(board[0]?.milesCost, 25_000);
});

test("buildOriginAwardLeaderboard flags gateway origins not in the traveler's home airports", async () => {
  const valuations = await getProgramValuations();
  const offers = [award("ONT", "alaska", 25_000), award("SEA", "alaska", 30_000)];
  const feederCashByGateway = new Map([["SEA", 85]]);
  const board = buildOriginAwardLeaderboard(
    offers,
    [],
    "economy",
    "2026-09-08",
    ["ONT"],
    valuations,
    feederCashByGateway,
    "ONT",
  );
  const seaRow = board.find((r) => r.origin === "SEA");
  const ontRow = board.find((r) => r.origin === "ONT");
  assert.equal(seaRow?.isGatewayPlay, true);
  assert.equal(seaRow?.feederOrigin, "ONT");
  assert.equal(seaRow?.feederCashUsd, 85);
  assert.equal(ontRow?.isGatewayPlay, false);
});

test("buildOriginAwardLeaderboard filters by cabin", async () => {
  const valuations = await getProgramValuations();
  const offers = [award("ONT", "alaska", 25_000, { cabin: "business" })];
  const board = buildOriginAwardLeaderboard(offers, [], "economy", "2026-09-08", ["ONT"], valuations, NO_FEEDER, "ONT");
  assert.equal(board.length, 0);
});

test("buildOriginAwardLeaderboard computes realized cents-per-point against the cheapest comparable cash fare", async () => {
  const valuations = await getProgramValuations();
  const cashOffers: CashOffer[] = [
    {
      kind: "cash",
      id: "cash-1",
      totalAmount: 60_000, // $600
      currency: "USD",
      cabin: "economy",
      segments: [segment("ONT", "FCO")],
      source: "duffel",
    },
  ];
  const offers = [award("ONT", "alaska", 25_000)];
  const board = buildOriginAwardLeaderboard(offers, cashOffers, "economy", "2026-09-08", ["ONT"], valuations, NO_FEEDER, "ONT");
  // $600 avoided / 25,000 miles = 2.4 cents per point.
  assert.equal(board[0]?.centsPerPoint, 2.4);
});
