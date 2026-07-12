import assert from "node:assert/strict";
import test from "node:test";
import { buildTripExportPayload, tripExportFilename } from "@/lib/travelAssistant/tripExport";
import type { TravelTrip } from "@/lib/travelAssistant/tripStore";

const sampleTrip: TravelTrip = {
  id: "trip-1",
  name: "Italy 2026!",
  destination: "Puglia",
  startDate: "2026-09-01",
  endDate: "2026-09-10",
  stage: "readiness",
  reservations: [],
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("buildTripExportPayload wraps trip in kepi-trip-v1 envelope", () => {
  const payload = buildTripExportPayload(sampleTrip);
  assert.equal(payload.format, "kepi-trip-v1");
  assert.equal(payload.trip.id, "trip-1");
  assert.ok(Date.parse(payload.exportedAt) > 0);
});

test("tripExportFilename sanitizes trip name", () => {
  const name = tripExportFilename("Italy 2026!", new Date("2026-07-12T00:00:00.000Z"));
  assert.equal(name, "Italy-2026-2026-07-12.json");
});
