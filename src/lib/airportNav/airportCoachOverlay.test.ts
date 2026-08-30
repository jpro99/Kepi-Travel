import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FCO_EES_ARRIVAL_COACH_DETAIL,
  seaPortCheckpointWaitCoachDetail,
} from "./airportCoachOverlay";

test("seaPortCheckpointWaitCoachDetail returns undefined when official text missing", () => {
  assert.equal(seaPortCheckpointWaitCoachDetail(null), undefined);
  assert.equal(seaPortCheckpointWaitCoachDetail(""), undefined);
});

test("seaPortCheckpointWaitCoachDetail uses official Port text only", () => {
  const detail = seaPortCheckpointWaitCoachDetail("Checkpoint 3 · ~12 min");
  assert.match(detail ?? "", /Checkpoint 3/);
  assert.match(detail ?? "", /Port of Seattle/);
});

test("FCO EES coach detail is coach text not a pin reference", () => {
  assert.match(FCO_EES_ARRIVAL_COACH_DETAIL, /EES/i);
  assert.match(FCO_EES_ARRIVAL_COACH_DETAIL, /not a kiosk pin/i);
});
