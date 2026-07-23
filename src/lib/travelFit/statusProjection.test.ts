import test from "node:test";
import assert from "node:assert/strict";
import { buildStatusProjections, projectAlaskaStatus } from "@/lib/travelFit/statusProjection";

test("projectAlaskaStatus uses baseline + Kepi segments for remaining math", () => {
  const projection = projectAlaskaStatus({
    currentTier: "MVP Gold",
    progress: { baseline: 34, kepiAdded: 2, total: 36, hasBaseline: true },
  });
  assert.ok(projection);
  assert.equal(projection?.currentValue, 36);
  assert.match(projection?.headline ?? "", /4 more Alaska segment/iu);
});

test("projectAlaskaStatus prompts for baseline instead of false huge gap", () => {
  const projection = projectAlaskaStatus({
    currentTier: "MVP Gold",
    progress: { baseline: 0, kepiAdded: 1, total: 1, hasBaseline: false },
  });
  assert.ok(projection);
  assert.match(projection?.headline ?? "", /starting point|Loyalty Wallet/iu);
});

test("buildStatusProjections merges wallet baseline with Kepi flights", () => {
  const projections = buildStatusProjections({
    loyaltyBalances: [
      {
        programId: "alaska",
        miles: 50000,
        tier: "MVP Gold",
        segmentsYtd: 30,
        progressBaselineAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    reservations: [
      {
        id: "f1",
        type: "flight",
        provider: "Alaska Airlines",
        flightDate: "2026-06-10",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "ONT",
      },
      {
        id: "f2",
        type: "flight",
        provider: "Alaska Airlines",
        flightDate: "2026-08-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
      },
    ],
    statuses: [],
  });
  const alaska = projections.find((p) => p.program.includes("Alaska"));
  assert.ok(alaska);
  assert.equal(alaska?.currentValue, 32);
});
