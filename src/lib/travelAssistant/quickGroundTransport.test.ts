import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlannedFlightLegs } from "@/lib/travelAssistant/tripPlanBooking";
import {
  buildQuickGroundTransportReservation,
  legCoveredByGroundTransport,
} from "@/lib/travelAssistant/quickGroundTransport";
import { listMissingTransportGaps } from "@/lib/travelAssistant/interCityTransport";

describe("quickGroundTransport", () => {
  it("buildQuickGroundTransportReservation creates a LOCAL ride with route text", () => {
    const legs = buildPlannedFlightLegs(
      null,
      [],
      [
        { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
        { stop: { name: "Cortina d'Ampezzo" }, checkIn: "2026-09-15", checkOut: "2026-09-18", nights: 3 },
      ],
      {},
      "2026-09-01",
      "2026-09-25",
    );
    const gap = listMissingTransportGaps(legs).find((row) => row.role === "connector");
    assert.ok(gap);

    const draft = buildQuickGroundTransportReservation(gap!, "uber");
    assert.equal(draft.type, "ride");
    assert.equal(draft.provider, "Uber");
    assert.equal(draft.confirmationCode, "LOCAL");
    assert.match(draft.location, /→/);
    assert.match(draft.title, /Uber/i);
  });

  it("legCoveredByGroundTransport marks connector leg booked after Uber save", () => {
    const stopRanges = [
      { stop: { name: "Venice", iata: "VCE" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
      { stop: { name: "Cortina d'Ampezzo", iata: "VCE" }, checkIn: "2026-09-15", checkOut: "2026-09-18", nights: 3 },
    ];
    const legsBefore = buildPlannedFlightLegs(null, [], stopRanges, {}, "2026-09-01", "2026-09-25");
    const connector = legsBefore.find((leg) => leg.role === "connector");
    assert.ok(connector);
    assert.equal(connector!.status, "needed");

    const ground = [
      {
        id: "ride-1",
        type: "ride",
        provider: "Uber",
        location: "Venice → Cortina d'Ampezzo",
        confirmationCode: "LOCAL",
      },
    ];
    assert.equal(legCoveredByGroundTransport(connector!, ground).covered, true);

    const legsAfter = buildPlannedFlightLegs(null, [], stopRanges, {}, "2026-09-01", "2026-09-25", ground);
    const updated = legsAfter.find((leg) => leg.id === connector!.id);
    assert.equal(updated?.status, "booked");
    assert.match(updated?.bookedSummary ?? "", /Uber/i);
  });
});
