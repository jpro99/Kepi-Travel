import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_PDF_ATTACHMENTS,
  BARI_VENICE_SEP_12_RESERVATIONS,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import { trainReservationsOnDayExpanded } from "@/lib/travelAssistant/travelDayTrainExpand";
import {
  areTravelDayTrainsComplete,
  resolveTrainLegEndUtcMs,
} from "@/lib/travelAssistant/travelDayTrainPhase";
import { buildHomeTravelDayCoach } from "@/lib/travelAssistant/homeTravelDayCoach";

test("G60: Regionale 91312 arrival 11:36 from stored PDF ends train phase after buffer", () => {
  const trains = trainReservationsOnDayExpanded(
    BARI_VENICE_SEP_12_RESERVATIONS as never[],
    "2026-09-12",
  );
  const reg91312 = trains.find((row) => row.trainNumber === "91312");
  assert.ok(reg91312);
  const endMs = resolveTrainLegEndUtcMs(reg91312!);
  assert.ok(Number.isFinite(endMs));

  const beforeBuffer = endMs + 5 * 60_000;
  assert.equal(
    areTravelDayTrainsComplete({ trains, nowMs: beforeBuffer }),
    false,
  );

  const afterBuffer = endMs + 15 * 60_000;
  assert.equal(
    areTravelDayTrainsComplete({ trains, nowMs: afterBuffer }),
    true,
  );
});

test("G60: geofence at BRI instantly completes train phase even before scheduled arrival", () => {
  const trains = trainReservationsOnDayExpanded(
    BARI_VENICE_SEP_12_RESERVATIONS as never[],
    "2026-09-12",
  );
  const morning = Date.parse("2026-09-12T07:00:00.000Z");
  assert.equal(
    areTravelDayTrainsComplete({
      trains,
      nowMs: morning,
      atFlightDepartureAirport: true,
    }),
    true,
  );
});

test("G60: travel day coach switches to airport headline after trains complete", () => {
  const atAirport = Date.parse("2026-09-12T10:00:00.000Z"); // noon Rome — 2h+ after 11:36 arrival
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12_RESERVATIONS as never[],
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    nowMs: atAirport,
    atFlightDepartureAirport: true,
    flightLeaveByHint: "Leave for the airport by 12:20 PM",
  });
  assert.ok(coach);
  assert.equal(coach!.trainsComplete, true);
  assert.match(coach!.headline, /At BRI/i);
  assert.match(coach!.headline, /Venice|VCE/i);
  assert.doesNotMatch(coach!.headline, /trains to Bari/i);
  assert.match(coach!.leaveCue ?? "", /12:20 PM/i);
  assert.doesNotMatch(coach!.leaveCue ?? "", /Train departs/i);
});

test("G60: morning before trains still leads with train copy", () => {
  const morning = Date.parse("2026-09-12T06:00:00.000Z"); // 8am Rome
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12_RESERVATIONS as never[],
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    nowMs: morning,
    flightLeaveByHint: "Leave for the airport by 12:20 PM",
  });
  assert.ok(coach);
  assert.equal(coach!.trainsComplete, false);
  assert.match(coach!.headline, /trains to Bari/i);
  assert.match(coach!.leaveCue ?? "", /Train departs 9:35/i);
});
