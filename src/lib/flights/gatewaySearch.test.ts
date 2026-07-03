import test from "node:test";
import assert from "node:assert/strict";
import {
  gatewayPlayTitle,
  resolveAwardSearchOrigins,
  resolveCashSearchOrigins,
} from "./gatewaySearch";

test("SoCal locals get West Coast gateway award search", () => {
  const award = resolveAwardSearchOrigins(["ONT", "PSP", "SNA"]);
  assert.deepEqual(award.locals, ["ONT", "PSP", "SNA"]);
  assert.ok(award.gateways.includes("SEA"));
  assert.ok(award.gateways.includes("SFO"));
  assert.ok(award.all.includes("SEA"));
});

test("Seattle user does not add redundant gateways", () => {
  const award = resolveAwardSearchOrigins(["SEA"]);
  assert.deepEqual(award.locals, ["SEA"]);
  assert.equal(award.gateways.length, 0);
});

test("cash search includes all nearby origins up to six", () => {
  const cash = resolveCashSearchOrigins(["ONT", "PSP", "SNA", "LAX", "BUR", "SAN", "LGB"]);
  assert.equal(cash.length, 6);
  assert.ok(cash.includes("PSP"));
});

test("gateway play title for SoCal feeder to SEA", () => {
  assert.equal(gatewayPlayTitle("SEA", "ONT"), "West Coast Gateway Play");
  assert.equal(gatewayPlayTitle("SEA"), "Seattle Sweet Spot");
});
