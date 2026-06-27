import test from "node:test";
import assert from "node:assert/strict";
import { parseDayIntent } from "./parseDayIntent";

test("parseDayIntent understands leave and go phrasing", () => {
  const intent = parseDayIntent("Leave Dolomites, go to Bari");
  assert.equal(intent?.kind, "move");
  assert.equal(intent?.fromCity, "Dolomites");
  assert.equal(intent?.toCity, "Bari");
  assert.equal(intent?.needsTransport, true);
  assert.equal(intent?.needsHotelCheckin, true);
});

test("parseDayIntent treats city-only input as stay", () => {
  const intent = parseDayIntent("Bari");
  assert.equal(intent?.kind, "stay");
  assert.equal(intent?.stayCity, "Bari");
});
