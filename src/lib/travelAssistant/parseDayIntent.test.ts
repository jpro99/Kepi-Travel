import test from "node:test";
import assert from "node:assert/strict";
import { parseDayIntent } from "./parseDayIntent";

test("parseDayIntent understands leave and go phrasing", () => {
  const intent = parseDayIntent("Leave Dolomites, go to Bari");
  assert.equal(intent?.kind, "move");
  assert.equal(intent?.fromCity, "Dolomites");
  assert.equal(intent?.toCity, "Bari");
});

test("parseDayIntent treats leave-only as depart not stay", () => {
  const intent = parseDayIntent("Leave Ortisei");
  assert.equal(intent?.kind, "depart");
  assert.match(intent?.fromCity ?? "", /Ortisei/i);
  assert.equal(intent?.toCity, undefined);
});

test("parseDayIntent normalizes Monopoly to Monopoli", () => {
  const intent = parseDayIntent("Go to Monopoly on 9/5");
  assert.equal(intent?.kind, "arrive");
  assert.match(intent?.stayCity ?? "", /Monopoli/i);
});

test("parseDayIntent treats In City phrasing as stay", () => {
  const intent = parseDayIntent("In Bari");
  assert.equal(intent?.kind, "stay");
  assert.equal(intent?.stayCity, "Bari");
});

test("parseDayIntent does not treat bare city name as stay", () => {
  const intent = parseDayIntent("Bari");
  assert.equal(intent?.kind, "unknown");
});
