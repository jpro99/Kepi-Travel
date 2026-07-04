import assert from "node:assert/strict";
import test from "node:test";
import { inferImportedTripMeta } from "./persistImportToTrip";

test("inferImportedTripMeta uses last flight arrival as destination", () => {
  const meta = inferImportedTripMeta([
    { type: "flight", localTime: "2026-09-14 08:45", flightArrivalAirport: "SEA" },
    { type: "flight", localTime: "2026-09-14 13:05", flightArrivalAirport: "HNL" },
  ]);
  assert.equal(meta.destination, "HNL");
  assert.equal(meta.name, "Trip to HNL");
});
