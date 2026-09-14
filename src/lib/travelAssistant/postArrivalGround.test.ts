import assert from "node:assert/strict";
import test from "node:test";
import { BARI_VENICE_SEP_12_RESERVATIONS } from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  hasActiveMidStayAtArrival,
  isArrivalDeplaneCoachCopy,
  shouldSuppressHomeArrivalCoach,
} from "@/lib/travelAssistant/postArrivalGround";

const SEP_14_ROME = Date.parse("2026-09-14T10:00:00Z");
const flight = BARI_VENICE_SEP_12_RESERVATIONS.find((row) => row.id === "flight-bri-vce")!;

test("G64: Venice mid-stay suppresses arrival/deplane coach after landing day", () => {
  const hotels = BARI_VENICE_SEP_12_RESERVATIONS.filter((row) => row.type === "hotel");
  assert.equal(
    hasActiveMidStayAtArrival({
      flight,
      hotels,
      nowMs: SEP_14_ROME,
      timezone: "Europe/Rome",
      stopRanges: [
        { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
      ],
    }),
    true,
  );
  assert.equal(
    shouldSuppressHomeArrivalCoach({
      flight,
      hotels,
      nowMs: SEP_14_ROME,
      timezone: "Europe/Rome",
    }),
    true,
  );
});

test("G64: deplane copy detector catches leave-plane strings", () => {
  assert.equal(isArrivalDeplaneCoachCopy("Leave the plane → Arrivals"), true);
  assert.equal(isArrivalDeplaneCoachCopy("Checkout Venice → Cortina"), false);
});
