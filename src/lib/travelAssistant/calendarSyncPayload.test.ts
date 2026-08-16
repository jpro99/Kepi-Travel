import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCalendarSyncReservations,
  isReservationCalendarSyncReady,
  toCalendarSyncReservationPayload,
} from "./calendarSyncPayload";

test("G30: incomplete reservations are not calendar-sync ready", () => {
  assert.equal(isReservationCalendarSyncReady({ title: "Tour", localTime: "2026-09-03 10:00", location: "" }), false);
  assert.equal(isReservationCalendarSyncReady({ title: "Tour", localTime: "", location: "Harbor" }), false);
  assert.equal(
    isReservationCalendarSyncReady({ title: "Tour", localTime: "2026-09-03 10:00", location: "Monopoli Harbor" }),
    true,
  );
});

test("G30: filter keeps only sync-ready rows and optional id subset", () => {
  const rows = [
    { id: "a", title: "Flight", localTime: "2026-09-01 08:00", location: "JFK" },
    { id: "b", title: "Hotel", localTime: "", location: "Venice" },
    { id: "c", title: "Dinner", localTime: "2026-09-03 19:00", location: "Monopoli" },
  ];
  assert.equal(filterCalendarSyncReservations(rows).length, 2);
  assert.deepEqual(
    filterCalendarSyncReservations(rows, ["c"]).map((row) => row.id),
    ["c"],
  );
});

test("G30: confirmation code falls back to reservation id", () => {
  const payload = toCalendarSyncReservationPayload({
    id: "res-99",
    type: "dinner",
    title: "Boat tour",
    confirmationCode: "",
    localTime: "2026-09-03 10:00",
    location: "Monopoli Harbor",
    timezone: "Europe/Rome",
  });
  assert.equal(payload.confirmationCode, "res-99");
});
