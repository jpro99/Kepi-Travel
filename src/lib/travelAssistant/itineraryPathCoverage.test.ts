import test from "node:test";
import assert from "node:assert/strict";
import {
  describeBookedAirportPath,
  findBookedAirportPath,
  isDirectLegCoveredByConnections,
} from "@/lib/travelAssistant/itineraryPathCoverage";

const bookedPath = [
  { fromCode: "MUC", toCode: "FCO", booked: true, departMs: Date.parse("2026-09-25T00:00:00Z") },
  { fromCode: "FCO", toCode: "SEA", booked: true, departMs: Date.parse("2026-09-25T04:15:00Z") },
  { fromCode: "SEA", toCode: "ONT", booked: true, departMs: Date.parse("2026-09-25T20:43:00Z") },
];

test("findBookedAirportPath connects Munich to Ontario via hubs", () => {
  assert.deepEqual(findBookedAirportPath(bookedPath, "MUC", "ONT"), ["MUC", "FCO", "SEA", "ONT"]);
  assert.equal(describeBookedAirportPath(bookedPath, "MUC", "ONT"), "MUC→FCO→SEA→ONT");
});

test("isDirectLegCoveredByConnections treats multi-hop return as satisfied", () => {
  assert.equal(
    isDirectLegCoveredByConnections({
      fromCode: "MUC",
      toCode: "ONT",
      legDate: "2026-09-25",
      segments: bookedPath,
    }),
    true,
  );
});

test("isDirectLegCoveredByConnections ignores unrelated airports", () => {
  assert.equal(
    isDirectLegCoveredByConnections({
      fromCode: "MUC",
      toCode: "ONT",
      legDate: "2026-09-25",
      segments: [{ fromCode: "MUC", toCode: "FCO", booked: true }],
    }),
    false,
  );
});
