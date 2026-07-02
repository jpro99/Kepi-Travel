import assert from "node:assert/strict";
import test from "node:test";
import { dedupeConsumerReservations } from "@/lib/travelAssistant/dedupeConsumerReservations";

test("dedupeConsumerReservations removes duplicate flights and keeps hotels", () => {
  const input = [
    { id: "a1", type: "flight", flightNumber: "AS654", flightDepartureTime: "2026-09-01 19:00", localTime: "2026-09-01 19:00" },
    { id: "a2", type: "flight", flightNumber: "AS654", flightDepartureTime: "2026-09-01 19:00", localTime: "2026-09-01 19:00" },
    { id: "h1", type: "hotel", localTime: "2026-09-01 15:00" },
    { id: "b1", type: "flight", flightNumber: "AS180", flightDepartureTime: "2026-09-01 00:30", localTime: "2026-09-01 00:30" },
  ];

  const out = dedupeConsumerReservations(input);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((row) => row.id),
    ["a1", "h1", "b1"],
  );
});
