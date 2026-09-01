import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfirmSpotFromLngLat } from "@/lib/airportNav/confirmTravelerSpot";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";

test("resolveConfirmSpotFromLngLat snaps a SEA terminal tap to a nearby node", () => {
  const alaska = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "AS" && p.category === "checkin");
  assert.ok(alaska, "SEA layout should include Alaska check-in");
  const node = SEA_LAYOUT.nodes.find((n) => n.id === alaska!.nodeId);
  assert.ok(node);
  const spot = resolveConfirmSpotFromLngLat(SEA_LAYOUT, node!.pos[0], node!.pos[1]);
  assert.ok(spot);
  assert.equal(spot!.nodeId, node!.id);
  assert.match(spot!.label, /alaska|check-in|door/i);
});

test("resolveConfirmSpotFromLngLat rejects taps far from the airport", () => {
  // Downtown Seattle — not in the terminal graph.
  const spot = resolveConfirmSpotFromLngLat(SEA_LAYOUT, -122.3321, 47.6062);
  assert.equal(spot, null);
});
