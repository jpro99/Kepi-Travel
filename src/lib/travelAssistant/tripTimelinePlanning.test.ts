import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompactTimelineDayKeys,
  reservationIsPast,
  splitPastAndUpcomingReservations,
} from "@/lib/travelAssistant/tripTimelinePlanning";

test("buildCompactTimelineDayKeys skips empty filler days", () => {
  const keys = buildCompactTimelineDayKeys(
    [
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-06-14T15:00:00",
        checkOutDate: "2026-06-15",
      },
    ],
    "2026-06-14",
    "2026-06-15",
  );
  assert.deepEqual(keys, ["2026-06-14", "2026-06-15"]);
});

test("splitPastAndUpcomingReservations archives old flights", () => {
  const nowMs = Date.parse("2026-06-12T12:00:00");
  const { past, upcoming } = splitPastAndUpcomingReservations(
    [
      {
        id: "f-old",
        type: "flight",
        localTime: "2026-06-01 08:00",
        flightDepartureTime: "2026-06-01 08:00",
        flightArrivalTime: "2026-06-01 14:00",
      },
      {
        id: "h-new",
        type: "hotel",
        localTime: "2026-06-14T15:00:00",
        checkOutDate: "2026-06-15",
      },
    ],
    nowMs,
  );
  assert.equal(past.length, 1);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0]?.id, "h-new");
});

test("reservationIsPast uses hotel checkout", () => {
  const nowMs = Date.parse("2026-06-16T12:00:00");
  assert.equal(
    reservationIsPast(
      { id: "h", type: "hotel", localTime: "2026-06-14T15:00:00", checkOutDate: "2026-06-15" },
      nowMs,
    ),
    true,
  );
});
